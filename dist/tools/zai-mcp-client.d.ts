export declare const ZAI_WEB_SEARCH_MCP_ENDPOINT = "https://api.z.ai/api/mcp/web_search_prime/mcp";
export declare const ZAI_WEB_READER_MCP_ENDPOINT = "https://api.z.ai/api/mcp/web_reader/mcp";
export interface ZaiMcpToolCall {
    endpoint: string;
    toolName: string;
    arguments: Record<string, unknown>;
    apiKey: string;
    signal?: AbortSignal;
}
export declare class ZaiMcpClient {
    private fetchImpl;
    private sessions;
    private nextId;
    constructor(fetchImpl?: typeof fetch);
    callTool(call: ZaiMcpToolCall): Promise<unknown>;
    private callToolInternal;
    private ensureInitialized;
    private discoverTools;
    private sendRequest;
    private sendNotification;
    private fetchJsonRpc;
}
export declare function callZaiMcpTool(call: ZaiMcpToolCall): Promise<unknown>;
//# sourceMappingURL=zai-mcp-client.d.ts.map