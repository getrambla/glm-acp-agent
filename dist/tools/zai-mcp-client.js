import { remapArguments, resolveToolName } from "./mcp-arg-remap.js";
const MCP_PROTOCOL_VERSION = "2025-06-18";
export const ZAI_WEB_SEARCH_MCP_ENDPOINT = "https://api.z.ai/api/mcp/web_search_prime/mcp";
export const ZAI_WEB_READER_MCP_ENDPOINT = "https://api.z.ai/api/mcp/web_reader/mcp";
export class ZaiMcpClient {
    fetchImpl;
    sessions = new Map();
    nextId = 1;
    constructor(fetchImpl = ((...args) => fetch(...args))) {
        this.fetchImpl = fetchImpl;
    }
    async callTool(call) {
        try {
            return await this.callToolInternal(call);
        }
        catch (err) {
            if (!isRetryableError(err))
                throw err;
            const cacheKey = `${call.endpoint}\n${call.apiKey}`;
            this.sessions.delete(cacheKey);
            return this.callToolInternal(call);
        }
    }
    async callToolInternal(call) {
        const session = await this.ensureInitialized(call);
        const toolNames = session.tools.map((t) => t.name);
        const resolvedName = resolveToolName(call.toolName, toolNames, call.endpoint);
        const toolSchema = session.tools.find((t) => t.name === resolvedName);
        const remappedArgs = remapArguments(call.arguments, toolSchema?.properties ?? []);
        const result = await this.sendRequest(call.endpoint, call.apiKey, "tools/call", {
            jsonrpc: "2.0",
            id: this.nextId++,
            method: "tools/call",
            params: {
                name: resolvedName,
                arguments: remappedArgs,
            },
        }, "tools/call", call.signal, session.sessionId, resolvedName);
        return result;
    }
    async ensureInitialized(call) {
        const cacheKey = `${call.endpoint}\n${call.apiKey}`;
        const cached = this.sessions.get(cacheKey);
        if (cached?.initialized)
            return cached;
        const initializeResponse = await this.fetchJsonRpc(call.endpoint, call.apiKey, "initialize", {
            jsonrpc: "2.0",
            id: this.nextId++,
            method: "initialize",
            params: {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: {
                    name: "glm-acp-agent",
                    version: "1.0.0",
                },
            },
        }, "initialize", call.signal);
        const sessionId = initializeResponse.sessionId;
        await this.sendNotification(call.endpoint, call.apiKey, {
            jsonrpc: "2.0",
            method: "notifications/initialized",
        }, "notifications/initialized", call.signal, sessionId);
        const tools = await this.discoverTools(call.endpoint, call.apiKey, sessionId, call.signal);
        const session = { sessionId, initialized: true, tools };
        this.sessions.set(cacheKey, session);
        return session;
    }
    async discoverTools(endpoint, apiKey, sessionId, signal) {
        const response = await this.fetchJsonRpc(endpoint, apiKey, "tools/list", {
            jsonrpc: "2.0",
            id: this.nextId++,
            method: "tools/list",
        }, "tools/list", signal, sessionId);
        const result = response.body.result;
        return (result?.tools?.map((t) => ({
            name: t.name,
            properties: t.inputSchema?.properties ? Object.keys(t.inputSchema.properties) : [],
        })) ?? []);
    }
    async sendRequest(endpoint, apiKey, mcpMethod, body, stage, signal, sessionId, mcpName) {
        const response = await this.fetchJsonRpc(endpoint, apiKey, mcpMethod, body, stage, signal, sessionId, mcpName);
        return response.body.result;
    }
    async sendNotification(endpoint, apiKey, body, mcpMethod, signal, sessionId) {
        const response = await this.fetchImpl(endpoint, {
            method: "POST",
            headers: buildHeaders(apiKey, mcpMethod, sessionId),
            body: JSON.stringify(body),
            signal,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(formatMcpError(mcpMethod, response.status, text));
        }
    }
    async fetchJsonRpc(endpoint, apiKey, mcpMethod, body, stage, signal, sessionId, mcpName) {
        const response = await this.fetchImpl(endpoint, {
            method: "POST",
            headers: buildHeaders(apiKey, mcpMethod, sessionId, mcpName),
            body: JSON.stringify(body),
            signal,
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(formatMcpError(stage, response.status, text));
        }
        const parsed = parseMcpResponse(text, response.headers.get("Content-Type") ?? "");
        if (parsed.error) {
            throw new Error(formatJsonRpcError(stage, parsed.error));
        }
        return {
            body: parsed,
            sessionId: response.headers.get("MCP-Session-Id") ?? undefined,
        };
    }
}
const defaultClient = new ZaiMcpClient();
export function callZaiMcpTool(call) {
    return defaultClient.callTool(call);
}
function buildHeaders(apiKey, mcpMethod, sessionId, mcpName) {
    const headers = new Headers({
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        "Mcp-Method": mcpMethod,
    });
    if (sessionId)
        headers.set("MCP-Session-Id", sessionId);
    if (mcpName)
        headers.set("Mcp-Name", mcpName);
    return headers;
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
function formatMcpError(stage, status, body) {
    if (isCodingPlanEligibilityError(body)) {
        return `MCP ${stage} failed: HTTP ${status}. Coding Plan quota/base URL/tool eligibility likely is not being met (business code 1113). ${body}`;
    }
    return `MCP ${stage} failed: HTTP ${status}: ${body}`;
}
function formatJsonRpcError(stage, error) {
    const details = JSON.stringify(error);
    if (isCodingPlanEligibilityError(details)) {
        return `MCP ${stage} failed: Coding Plan quota/base URL/tool eligibility likely is not being met (business code 1113). ${details}`;
    }
    return `MCP ${stage} failed: ${details}`;
}
function isCodingPlanEligibilityError(body) {
    return /(^|["\s:])1113($|["\s,}])/.test(body);
}
function isRetryableError(error) {
    if (!(error instanceof Error))
        return false;
    const msg = error.message.toLowerCase();
    if (/-32601/.test(msg))
        return true;
    if (/-32602/.test(msg))
        return true;
    if (/tool.*not.*found|not.*found.*tool|unknown.*tool/.test(msg))
        return true;
    return false;
}
//# sourceMappingURL=zai-mcp-client.js.map