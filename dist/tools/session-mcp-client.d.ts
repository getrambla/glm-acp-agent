import { type ChildProcessWithoutNullStreams } from "node:child_process";
import type { McpServer, McpServerStdio } from "@agentclientprotocol/sdk";
import { type ToolDefinition } from "./definitions.js";
interface McpTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}
interface ToolBinding {
    exposedName: string;
    sourceName: string;
    client: ConnectedMcpClient;
    definition: ToolDefinition;
}
interface ConnectedMcpClient {
    listTools(): Promise<McpTool[]>;
    callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
    dispose(): Promise<void>;
}
export declare class SessionMcpTools {
    private bindings;
    constructor(bindings: ToolBinding[]);
    get toolDefinitions(): ToolDefinition[];
    get toolNames(): string[];
    hasTool(name: string): boolean;
    callTool(exposedName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
    dispose(): Promise<void>;
}
export declare function connectSessionMcpServers(servers: ReadonlyArray<McpServer>): Promise<SessionMcpTools>;
export interface StdioMcpClientOptions {
    /** Maximum time for the MCP handshake (spawn + initialize). Generous by default for cold `npx -y` fetches. */
    initializationTimeoutMs?: number;
    /** Maximum time for an individual JSON-RPC request. */
    requestTimeoutMs?: number;
    /** Platform override for tests. */
    platform?: NodeJS.Platform;
    /** Windows command interpreter override for tests. */
    comSpec?: string;
    /** Windows process-tree terminator override for tests. */
    killProcessTree?: (pid: number) => boolean;
    /** Override the spawn function for tests. */
    spawn?: (command: string, args: string[], options: {
        env: NodeJS.ProcessEnv;
        windowsHide?: boolean;
        windowsVerbatimArguments?: boolean;
    }) => ChildProcessWithoutNullStreams;
}
export declare class StdioMcpClient implements ConnectedMcpClient {
    private server;
    private opts;
    private child;
    private initialized;
    private initializingChild;
    private initializationWaiters;
    private nextId;
    private pending;
    private buffer;
    private stderrTail;
    private exited;
    private exitReason;
    private disposed;
    private secrets;
    private readonly killProcessTree;
    constructor(server: McpServerStdio, opts?: StdioMcpClientOptions);
    listTools(): Promise<McpTool[]>;
    callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
    dispose(): Promise<void>;
    /**
     * Wait for the shared handshake without letting one caller's abort tear it down for the others:
     * the child is only killed when the aborting caller is the last one still waiting on it.
     */
    private awaitInitialization;
    private ensureInitialized;
    private startAndInitialize;
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
    private resolveLaunch;
    private launchError;
    private request;
    private rejectAllPending;
    /** Tear the connection down once and propagate the reason into every in-flight request. */
    private failConnection;
    private terminateChild;
    private handleStderr;
    private withStderr;
    private send;
    private handleStdout;
}
export {};
//# sourceMappingURL=session-mcp-client.d.ts.map