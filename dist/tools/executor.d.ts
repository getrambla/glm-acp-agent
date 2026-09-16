import type { AgentSideConnection, ClientCapabilities } from "@agentclientprotocol/sdk";
import type { SessionMcpTools } from "./session-mcp-client.js";
import type { VisionMcpClient } from "./vision-mcp-client.js";
import type { SessionModeId } from "../protocol/agent.js";
/**
 * Result returned after executing a tool call against the ACP client.
 */
export interface ToolResult {
    content: string;
}
/**
 * Executes GLM tool calls from inside the agent process.
 *
 * Permission is requested from the user before any write or execute operation,
 * while read/list operations and approved writes/commands run locally with
 * paths resolved relative to the ACP session cwd.
 */
export interface TodoItem {
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm?: string;
}
export declare class ToolExecutor {
    private connection;
    private sessionId;
    private clientCapabilities;
    private signal?;
    private visionClient;
    private sessionMcpTools;
    private sessionCwd;
    private getMode;
    private setTodos;
    constructor(connection: AgentSideConnection, sessionId: string, clientCapabilities?: ClientCapabilities | null, signal?: AbortSignal | undefined, visionClient?: VisionMcpClient | null, sessionMcpTools?: SessionMcpTools | null, sessionCwd?: string, getMode?: () => SessionModeId, setTodos?: (todos: TodoItem[]) => void);
    /**
     * Dispatch a tool call from GLM to the appropriate ACP Client method.
     *
     * Returns a plain text result that can be fed back to GLM as a tool message.
     */
    execute(toolCallId: string, toolName: string, rawArguments: string): Promise<ToolResult>;
    private readFile;
    private todoWrite;
    private writeFile;
    /**
     * Route the actual write through the ACP client when it advertises
     * `fs.writeTextFile` (e.g. Zed), so edits land in the client's buffer and
     * render as native editor diffs. Fall back to writing from the agent process
     * when the client has no fs capability.
     */
    private performWrite;
    /**
     * Mirror of performWrite for reads, used by edit_file: when the client
     * advertises BOTH `fs.readTextFile` and `fs.writeTextFile`, read through the
     * client so the edit is computed against the same contents the user sees (a
     * dirty editor buffer). Reading a client buffer we cannot write back would
     * leave the editor showing stale content while disk diverges, so a
     * read-without-write capability falls back to plain agent-process disk I/O.
     */
    private performRead;
    private editFile;
    private listFiles;
    private runCommand;
    private runLocalCommand;
    private resolvePath;
    private webSearch;
    private webReader;
    private imageAnalysis;
    private sessionMcpTool;
    /**
     * Request permission from the user based on the current session mode.
     *
     * Returns a result indicating whether to allow, reject, or cancel the operation,
     * or whether a transport error occurred.
     */
    private maybeRequestPermission;
    /** Mark an in-progress tool call as failed. */
    private markFailed;
    /**
     * Emit a brand new failed tool_call (for situations where we never made it
     * to in_progress, e.g. invalid arguments / missing capabilities).
     */
    private failedToolCall;
    private failAndReturn;
}
//# sourceMappingURL=executor.d.ts.map