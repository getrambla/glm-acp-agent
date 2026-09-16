import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from "node:child_process";
import { TOOL_DEFINITIONS } from "./definitions.js";
const MCP_PROTOCOL_VERSION = "2025-06-18";
/** Generous: a cold `npx -y` fetch on Windows Defender can take well over a minute. */
const DEFAULT_INITIALIZATION_TIMEOUT_MS = 120_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const STDERR_TAIL_LIMIT = 16_384;
const STDERR_MESSAGE_LIMIT = 2_000;
/** Extensionless launchers that resolve to a `.cmd` shim on Windows, which Node cannot spawn directly. */
const WINDOWS_SHIM_COMMANDS = new Set(["npx", "npm", "pnpm", "yarn", "bunx"]);
/** Characters cmd.exe treats specially; any of them in a client-supplied token is a launch injection risk. */
const CMD_METACHARACTERS = /[&|<>^"%!\r\n\0]/;
const SECRET_ENV_NAME = /key|token|secret|password|passwd|pwd|credential|auth|cookie/i;
/** Exact names that match SECRET_ENV_NAME but are never credentials — exempt these, not the substring. */
const NON_SECRET_ENV_NAMES = new Set(["PWD", "OLDPWD"]);
export class SessionMcpTools {
    bindings = new Map();
    constructor(bindings) {
        for (const binding of bindings) {
            this.bindings.set(binding.exposedName, binding);
        }
    }
    get toolDefinitions() {
        return Array.from(this.bindings.values()).map((binding) => binding.definition);
    }
    get toolNames() {
        return Array.from(this.bindings.keys());
    }
    hasTool(name) {
        return this.bindings.has(name);
    }
    async callTool(exposedName, args, signal) {
        const binding = this.bindings.get(exposedName);
        if (!binding)
            throw new Error(`Unknown MCP tool: ${exposedName}`);
        return binding.client.callTool(binding.sourceName, args, signal);
    }
    async dispose() {
        const clients = new Set(Array.from(this.bindings.values()).map((binding) => binding.client));
        await Promise.all(Array.from(clients).map((client) => client.dispose().catch(() => undefined)));
        this.bindings.clear();
    }
}
export async function connectSessionMcpServers(servers) {
    const usedNames = new Set(TOOL_DEFINITIONS.map((tool) => tool.function.name));
    const bindings = [];
    const clients = [];
    try {
        for (const server of servers) {
            const client = createClient(server);
            clients.push(client);
            const tools = await client.listTools();
            for (const tool of tools) {
                const exposedName = chooseToolName(tool.name, server.name, usedNames);
                usedNames.add(exposedName);
                bindings.push({
                    exposedName,
                    sourceName: tool.name,
                    client,
                    definition: {
                        type: "function",
                        function: {
                            name: exposedName,
                            description: tool.description ?? `Call ${tool.name} on the ${server.name} MCP server.`,
                            parameters: normalizeSchema(tool.inputSchema),
                        },
                    },
                });
            }
        }
    }
    catch (err) {
        await Promise.all(clients.map((client) => client.dispose().catch(() => undefined)));
        throw err;
    }
    return new SessionMcpTools(bindings);
}
function createClient(server) {
    if ("type" in server && server.type === "http") {
        return new HttpMcpClient(server);
    }
    if ("type" in server && server.type === "sse") {
        throw new Error(`MCP server "${server.name}" uses SSE transport, which is not supported yet.`);
    }
    return new StdioMcpClient(server);
}
class HttpMcpClient {
    server;
    nextId = 1;
    initialized = null;
    mcpSessionId;
    constructor(server) {
        this.server = server;
    }
    async listTools() {
        await this.ensureInitialized();
        const result = await this.request("tools/list", {}, "tools/list");
        return extractTools(result);
    }
    async callTool(name, args, signal) {
        await this.ensureInitialized();
        return this.request("tools/call", { name, arguments: args }, "tools/call", signal, name);
    }
    async dispose() {
        this.initialized = null;
        this.mcpSessionId = undefined;
    }
    async ensureInitialized() {
        if (this.initialized)
            return this.initialized;
        this.initialized = this.initialize();
        try {
            await this.initialized;
        }
        catch (err) {
            this.initialized = null;
            throw err;
        }
    }
    async initialize() {
        const response = await this.fetchJsonRpc("initialize", {
            jsonrpc: "2.0",
            id: this.nextId++,
            method: "initialize",
            params: {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: "glm-acp-agent", version: "1.0.0" },
            },
        }, "initialize");
        this.mcpSessionId = response.sessionId;
        await this.sendNotification({
            jsonrpc: "2.0",
            method: "notifications/initialized",
        });
    }
    async request(method, params, stage, signal, mcpName) {
        const response = await this.fetchJsonRpc(method, {
            jsonrpc: "2.0",
            id: this.nextId++,
            method,
            params,
        }, stage, signal, mcpName);
        return response.body.result;
    }
    async sendNotification(body) {
        const response = await fetch(this.server.url, {
            method: "POST",
            headers: this.headers("notifications/initialized"),
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`MCP ${this.server.name} notifications/initialized failed: HTTP ${response.status}: ${await response.text()}`);
        }
    }
    async fetchJsonRpc(mcpMethod, body, stage, signal, mcpName) {
        const response = await fetch(this.server.url, {
            method: "POST",
            headers: this.headers(mcpMethod, mcpName),
            body: JSON.stringify(body),
            signal,
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`MCP ${this.server.name} ${stage} failed: HTTP ${response.status}: ${text}`);
        }
        const parsed = parseMcpResponse(text, response.headers.get("Content-Type") ?? "");
        if (parsed.error) {
            throw new Error(`MCP ${this.server.name} ${stage} failed: ${JSON.stringify(parsed.error)}`);
        }
        return {
            body: parsed,
            sessionId: response.headers.get("MCP-Session-Id") ?? undefined,
        };
    }
    headers(mcpMethod, mcpName) {
        const headers = new Headers();
        for (const header of this.server.headers) {
            headers.set(header.name, header.value);
        }
        headers.set("Accept", "application/json, text/event-stream");
        headers.set("Content-Type", "application/json");
        headers.set("MCP-Protocol-Version", MCP_PROTOCOL_VERSION);
        headers.set("Mcp-Method", mcpMethod);
        if (this.mcpSessionId)
            headers.set("MCP-Session-Id", this.mcpSessionId);
        if (mcpName)
            headers.set("Mcp-Name", mcpName);
        return headers;
    }
}
export class StdioMcpClient {
    server;
    opts;
    child = null;
    initialized = null;
    initializingChild = null;
    initializationWaiters = 0;
    nextId = 1;
    pending = new Map();
    buffer = "";
    stderrTail = "";
    exited = false;
    exitReason = null;
    disposed = false;
    secrets = [];
    killProcessTree;
    constructor(server, opts = {}) {
        this.server = server;
        this.opts = opts;
        this.killProcessTree = opts.killProcessTree ?? taskkillTree;
    }
    async listTools() {
        // Counted as an initialization waiter too, so a concurrent callTool abort cannot
        // tear down the handshake this call is still waiting on.
        await this.awaitInitialization();
        return extractTools(await this.request("tools/list", {}, "tools/list"));
    }
    async callTool(name, args, signal) {
        if (signal?.aborted)
            throw new Error(`MCP ${this.server.name} call cancelled`);
        await this.awaitInitialization(signal);
        return this.request("tools/call", { name, arguments: args }, `tools/call ${name}`, signal);
    }
    async dispose() {
        const child = this.child;
        this.disposed = true;
        this.child = null;
        this.initialized = null;
        this.initializingChild = null;
        this.exited = true;
        this.exitReason = "client disposed";
        if (child)
            this.terminateChild(child);
        this.rejectAllPending(new Error("cancelled (client disposed)"));
    }
    /**
     * Wait for the shared handshake without letting one caller's abort tear it down for the others:
     * the child is only killed when the aborting caller is the last one still waiting on it.
     */
    async awaitInitialization(signal) {
        const initialization = this.ensureInitialized();
        const waiting = this.initializingChild !== null;
        if (waiting)
            this.initializationWaiters += 1;
        try {
            await waitForAbort(initialization, signal, `MCP ${this.server.name} call cancelled`);
        }
        catch (err) {
            const child = this.initializingChild;
            if (signal?.aborted && waiting && this.initializationWaiters === 1 && child) {
                this.failConnection(new Error("initialization aborted"), child, true);
            }
            throw err;
        }
        finally {
            if (waiting)
                this.initializationWaiters -= 1;
        }
    }
    ensureInitialized() {
        if (this.disposed)
            throw new Error(`MCP ${this.server.name} client disposed`);
        if (this.initialized && this.child && !this.exited)
            return this.initialized;
        const initialization = this.startAndInitialize();
        this.initialized = initialization;
        void initialization.catch(() => {
            if (this.initialized === initialization)
                this.initialized = null;
        });
        return initialization;
    }
    async startAndInitialize() {
        const { command, args, spawnOptions } = this.resolveLaunch();
        const spawnFn = this.opts.spawn ?? nodeSpawn;
        // Redact against the env the child actually gets — it inherits process.env, so a
        // credential the parent holds can surface in the child's stderr.
        const env = buildStdioEnv(this.server);
        this.secrets = collectSecretEnvValues(env);
        this.exited = false;
        this.exitReason = null;
        this.buffer = "";
        this.stderrTail = "";
        let child;
        try {
            child = spawnFn(command, args, { env, windowsHide: true, ...spawnOptions });
        }
        catch (err) {
            throw this.launchError(err);
        }
        this.child = child;
        this.initializingChild = child;
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            if (this.child === child)
                this.handleStdout(chunk);
        });
        // Drain stderr even when we never read it: an undrained pipe eventually blocks the child.
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => {
            if (this.child === child)
                this.handleStderr(chunk);
        });
        child.on("exit", (code, sig) => {
            this.failConnection(new Error(`server exited (exit code=${code} signal=${sig ?? "(none)"}).`), child, false);
        });
        child.on("error", (err) => {
            this.failConnection(this.launchError(err), child, true);
        });
        const deadline = Date.now() + (this.opts.initializationTimeoutMs ?? DEFAULT_INITIALIZATION_TIMEOUT_MS);
        try {
            await this.request("initialize", {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: "glm-acp-agent", version: "1.0.0" },
            }, "initialize", undefined, Math.max(1, deadline - Date.now()));
            this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
            if (this.initializingChild === child)
                this.initializingChild = null;
        }
        catch (err) {
            this.failConnection(err instanceof Error ? err : new Error(String(err)), child, true);
            throw err;
        }
    }
    /**
     * Windows cannot `spawn` a `.cmd`/`.bat` shim directly (bare `npx` yields async ENOENT,
     * `npx.cmd` yields EINVAL), so those go through `cmd.exe /d /s /c`. Because the command and
     * args are client-supplied, every token routed through cmd.exe is validated first — we reject
     * rather than try to escape.
     *
     * cmd.exe strips the first and last quote after `/s /c`, so passing the command as its own
     * argv entry breaks a spaced path Node quoted for it (e.g. `C:\Program Files\nodejs\npx.cmd`
     * becomes `'C:\Program' is not recognized`). The whole line is therefore built here —
     * whitespace tokens quoted, one outer quote pair for cmd.exe to strip — and passed verbatim
     * so Node does not re-escape it. Tokens are metacharacter-free, so this stays safe.
     */
    resolveLaunch() {
        const platform = this.opts.platform ?? process.platform;
        const command = this.server.command;
        const args = [...this.server.args];
        if (platform !== "win32" || !needsWindowsShim(command)) {
            return { command, args };
        }
        for (const token of [command, ...args]) {
            if (CMD_METACHARACTERS.test(token)) {
                throw new Error(`MCP ${this.server.name} startup failed: unsafe token for the cmd.exe launch of \`${command}\` ` +
                    `(contains a shell metacharacter): ${token}`);
            }
        }
        const comSpec = this.opts.comSpec ?? process.env["ComSpec"] ?? "cmd.exe";
        // Quote whitespace tokens (cmd.exe must keep them as one argv entry) and empty
        // tokens (an unquoted "" would vanish in join, shifting the child's argv).
        const line = [command, ...args]
            .map((token) => (token.length === 0 || /\s/.test(token) ? `"${token}"` : token))
            .join(" ");
        return {
            command: comSpec,
            args: ["/d", "/s", "/c", `"${line}"`],
            spawnOptions: { windowsVerbatimArguments: true },
        };
    }
    launchError(err) {
        if (err.code === "ENOENT") {
            return new Error(`MCP ${this.server.name} failed: could not launch \`${this.server.command}\`. ` +
                `Ensure it is installed and available on PATH.`, { cause: err });
        }
        if (err.code === "EINVAL") {
            return new Error(`MCP ${this.server.name} failed: could not launch \`${this.server.command}\` (EINVAL). ` +
                `On Windows a .cmd/.bat launcher must be started through cmd.exe.`, { cause: err });
        }
        return new Error(`MCP ${this.server.name} process error: ${err.message}`, { cause: err });
    }
    request(method, params, label, signal, timeoutMs = this.opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            const id = this.nextId++;
            let settled = false;
            const onAbort = () => {
                const pending = this.pending.get(id);
                if (!pending)
                    return;
                this.pending.delete(id);
                pending.reject(new Error("aborted"));
            };
            const cleanup = () => {
                clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
            };
            const settle = (fn, value) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                fn(value);
            };
            this.pending.set(id, {
                resolve: (value) => settle(resolve, value),
                reject: (err) => settle(reject, new Error(`MCP ${this.server.name} ${label} failed: ${this.withStderr(err.message)}`)),
            });
            const timer = setTimeout(() => {
                const pending = this.pending.get(id);
                if (!pending)
                    return;
                const timeout = new Error(`request timed out after ${timeoutMs}ms`);
                const child = this.child;
                if (child) {
                    this.failConnection(timeout, child, true);
                    return;
                }
                this.pending.delete(id);
                pending.reject(timeout);
            }, timeoutMs);
            signal?.addEventListener("abort", onAbort, { once: true });
            if (signal?.aborted) {
                onAbort();
                return;
            }
            try {
                this.send({ jsonrpc: "2.0", id, method, params });
            }
            catch (err) {
                const pending = this.pending.get(id);
                this.pending.delete(id);
                pending?.reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
    }
    rejectAllPending(error) {
        const pending = [...this.pending.values()];
        this.pending.clear();
        for (const request of pending)
            request.reject(error);
    }
    /** Tear the connection down once and propagate the reason into every in-flight request. */
    failConnection(error, child, kill) {
        if (this.child !== child || this.exited)
            return;
        this.child = null;
        if (this.initializingChild === child)
            this.initializingChild = null;
        this.exited = true;
        this.exitReason = error.message;
        this.initialized = null;
        this.rejectAllPending(error);
        if (kill)
            this.terminateChild(child);
    }
    terminateChild(child) {
        const platform = this.opts.platform ?? process.platform;
        // `child.kill()` only reaches cmd.exe, orphaning the npx -> node tree underneath it.
        if (platform === "win32" && child.pid && child.exitCode === null) {
            try {
                if (this.killProcessTree(child.pid))
                    return;
            }
            catch {
                // fall back to the direct child below
            }
        }
        try {
            child.kill();
        }
        catch {
            // ignore
        }
    }
    handleStderr(chunk) {
        const tail = chunk.length >= STDERR_TAIL_LIMIT ? chunk.slice(-STDERR_TAIL_LIMIT) : this.stderrTail + chunk;
        this.stderrTail = tail.slice(-STDERR_TAIL_LIMIT);
    }
    withStderr(message) {
        let stderr = this.stderrTail.trim();
        if (!stderr)
            return message;
        for (const secret of this.secrets)
            stderr = stderr.split(secret).join("[REDACTED]");
        stderr = stderr.replace(/\s+/g, " ").slice(-STDERR_MESSAGE_LIMIT);
        return `${message}; stderr: ${stderr}`;
    }
    send(message) {
        if (!this.child || this.exited) {
            throw new Error(`MCP ${this.server.name} server is not running${this.exitReason ? ` (${this.exitReason})` : ""}.`);
        }
        this.child.stdin.write(JSON.stringify(message) + "\n");
    }
    handleStdout(chunk) {
        this.buffer += chunk;
        let idx;
        while ((idx = this.buffer.indexOf("\n")) !== -1) {
            const line = this.buffer.slice(0, idx).trim();
            this.buffer = this.buffer.slice(idx + 1);
            if (!line)
                continue;
            let parsed;
            try {
                parsed = JSON.parse(line);
            }
            catch {
                continue;
            }
            if (typeof parsed.id !== "number")
                continue;
            const pending = this.pending.get(parsed.id);
            if (!pending)
                continue;
            this.pending.delete(parsed.id);
            if (parsed.error) {
                pending.reject(new Error(parsed.error.message ?? `code ${parsed.error.code ?? "?"}`));
            }
            else {
                pending.resolve(parsed.result);
            }
        }
    }
}
function needsWindowsShim(command) {
    const base = command.replace(/^.*[\\/]/, "").toLowerCase();
    return WINDOWS_SHIM_COMMANDS.has(base) || base.endsWith(".cmd") || base.endsWith(".bat");
}
/** Windows: kill the whole cmd.exe -> npx -> node tree, not just the interpreter we spawned. */
function taskkillTree(pid) {
    return nodeSpawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
    }).status === 0;
}
function collectSecretEnvValues(env) {
    const values = new Set();
    for (const [name, value] of Object.entries(env)) {
        if (NON_SECRET_ENV_NAMES.has(name.toUpperCase()))
            continue;
        if (value && value.length >= 4 && SECRET_ENV_NAME.test(name))
            values.add(value);
    }
    // Longest first, so a secret that contains another is replaced before its substring.
    return [...values].sort((a, b) => b.length - a.length);
}
function waitForAbort(promise, signal, message) {
    if (!signal)
        return promise;
    if (signal.aborted)
        return Promise.reject(new Error(message));
    return new Promise((resolve, reject) => {
        let settled = false;
        const claim = () => {
            if (settled)
                return false;
            settled = true;
            signal.removeEventListener("abort", onAbort);
            return true;
        };
        const onAbort = () => {
            if (claim())
                reject(new Error(message));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then((value) => {
            if (claim())
                resolve(value);
        }, (error) => {
            if (claim())
                reject(error);
        });
    });
}
function buildStdioEnv(server) {
    const env = { ...process.env };
    for (const entry of server.env) {
        env[entry.name] = entry.value;
    }
    return env;
}
function extractTools(result) {
    if (!isRecord(result))
        return [];
    const tools = result["tools"];
    if (!Array.isArray(tools))
        return [];
    return tools
        .filter((tool) => isRecord(tool) && typeof tool["name"] === "string")
        .map((tool) => ({
        name: tool["name"],
        description: typeof tool["description"] === "string" ? tool["description"] : undefined,
        inputSchema: isRecord(tool["inputSchema"]) ? tool["inputSchema"] : undefined,
    }));
}
function chooseToolName(sourceName, serverName, usedNames) {
    const safeSource = sanitizeToolName(sourceName) || "tool";
    if (!usedNames.has(safeSource))
        return safeSource;
    const safeServer = sanitizeToolName(serverName) || "mcp";
    const base = `${safeServer}_${safeSource}`.slice(0, 60);
    let candidate = base;
    let suffix = 2;
    while (usedNames.has(candidate)) {
        candidate = `${base}_${suffix++}`.slice(0, 64);
    }
    return candidate;
}
function sanitizeToolName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}
function normalizeSchema(schema) {
    if (!schema)
        return { type: "object", properties: {} };
    return schema;
}
function parseMcpResponse(text, contentType) {
    if (!text.trim()) {
        throw new Error("MCP response was empty.");
    }
    if (contentType.toLowerCase().includes("text/event-stream")) {
        return parseSseJsonRpc(text);
    }
    return JSON.parse(text);
}
function parseSseJsonRpc(text) {
    const dataLines = [];
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith("data:")) {
            dataLines.push(line.slice("data:".length).trimStart());
        }
    }
    for (const data of dataLines) {
        if (!data || data === "[DONE]")
            continue;
        const parsed = JSON.parse(data);
        if (parsed.result !== undefined || parsed.error !== undefined)
            return parsed;
    }
    throw new Error("MCP SSE response did not contain a JSON-RPC result.");
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
//# sourceMappingURL=session-mcp-client.js.map