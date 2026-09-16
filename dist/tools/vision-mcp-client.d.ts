import { type ChildProcessWithoutNullStreams } from "node:child_process";
export interface VisionMcpClient {
    callTool(toolName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
    dispose(): Promise<void>;
}
interface StdioVisionMcpClientOptions {
    apiKey: string;
    /** Override the package spec for tests/pinning. Defaults to `@z_ai/mcp-server@latest`. */
    packageSpec?: string;
    /** Maximum time for Vision MCP initialization and tool discovery. */
    initializationTimeoutMs?: number;
    /** Maximum time for an individual Vision MCP request. */
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
    }) => ChildProcessWithoutNullStreams;
}
export declare class StdioVisionMcpClient implements VisionMcpClient {
    private opts;
    private child;
    private initialized;
    private initializingChild;
    private initializationWaiters;
    private nextId;
    private pending;
    private buffer;
    private exited;
    private exitReason;
    private discoveredTools;
    private stderrTail;
    constructor(opts: StdioVisionMcpClientOptions);
    callTool(toolName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
    private callToolInternal;
    private resolveAndRemap;
    private rediscoverTools;
    dispose(): Promise<void>;
    private ensureInitialized;
    private startAndInitialize;
    private request;
    private rejectAllPending;
    private failConnection;
    private terminateChild;
    private handleStderr;
    private withStderr;
    private send;
    private handleStdout;
}
export {};
//# sourceMappingURL=vision-mcp-client.d.ts.map