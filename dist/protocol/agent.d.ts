import type { Agent, AgentSideConnection, InitializeRequest, InitializeResponse, NewSessionRequest, NewSessionResponse, PromptRequest, PromptResponse, CancelNotification, AuthenticateRequest, AuthenticateResponse, SetSessionModeRequest, SetSessionModeResponse, CloseSessionRequest, ListSessionsRequest, ListSessionsResponse, LoadSessionRequest, LoadSessionResponse, ForkSessionRequest, ForkSessionResponse, ResumeSessionRequest, ResumeSessionResponse, SetSessionModelRequest, SetSessionModelResponse, SetSessionConfigOptionRequest, SetSessionConfigOptionResponse } from "@agentclientprotocol/sdk";
import { type GlmMessage, type GlmStreamChunk, type StreamChatOptions } from "../llm/glm-client.js";
import { SessionStore } from "./session-store.js";
import { type VisionMcpClient } from "../tools/vision-mcp-client.js";
/**
 * ACP session mode identifiers. These control when the agent requests user
 * permission for tool calls that mutate state.
 */
export type SessionModeId = "default" | "accept_edits" | "bypass_permissions";
/**
 * Optional dependencies for tests.
 */
export interface GlmAcpAgentOptions {
    /** Override the GLM client (used in tests). */
    glm?: {
        streamChat: (messages: GlmMessage[], signal?: AbortSignal, options?: StreamChatOptions) => AsyncIterable<GlmStreamChunk>;
    };
    /**
     * Maximum number of model/tool turns per single prompt. Default 100,
     * overridable via `$ACP_GLM_MAX_TURNS`.
     */
    maxTurns?: number;
    /**
     * Override the session store (used in tests). When undefined the agent
     * uses an on-disk store rooted at `$ACP_GLM_SESSION_DIR` /
     * `$XDG_STATE_HOME/glm-acp-agent/sessions` / `~/.local/state/glm-acp-agent/sessions`.
     * Pass `null` to disable persistence entirely.
     */
    sessionStore?: SessionStore | null;
    /**
     * Vision MCP client used to analyze ACP image blocks via @z_ai/mcp-server.
     * Pass `null` to disable vision entirely (image blocks degrade to a text
     * placeholder). When undefined the agent lazy-creates a StdioVisionMcpClient
     * on first use.
     */
    visionClient?: VisionMcpClient | null;
}
/**
 * GlmAcpAgent implements the ACP `Agent` interface.
 *
 * It bridges the ACP protocol (via `AgentSideConnection`) and the Zhipu AI
 * GLM series models (via `GlmClient`), providing a full prompt loop with
 * tool-calling and streaming support.
 */
export declare const DEFAULT_MAX_TURNS = 100;
export declare class GlmAcpAgent implements Agent {
    private connection;
    private sessions;
    private sessionTodos;
    private _glm;
    private maxTurns;
    /** Forward GLM reasoning to the client as agent_thought_chunk. Default on; disable with ACP_GLM_STREAM_THINKING=false. */
    private streamThinking;
    private clientCapabilities;
    private sessionStore;
    private _visionClient;
    private visionClientExplicit;
    constructor(connection: AgentSideConnection, options?: GlmAcpAgentOptions);
    private get glm();
    private get visionClient();
    initialize(params: InitializeRequest): Promise<InitializeResponse>;
    authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse>;
    newSession(params: NewSessionRequest): Promise<NewSessionResponse>;
    /**
     * Queue an `available_commands_update` snapshot for a session.
     *
     * The notification is the only channel ACP gives us for slash-command
     * autocomplete — it is not part of any method's response — so every session
     * entry point (create / load / fork / resume) has to send one.
     *
     * It is deliberately *deferred* rather than awaited inline: a client learns a
     * session's id from the `session/new` / `session/fork` response, so a
     * notification written ahead of that response arrives for a session the client
     * has never heard of, and clients drop those. Sending on the next macrotask
     * puts it behind the response the caller is about to return (and, on load,
     * behind the replayed transcript), which is also when a client is ready to
     * paint the menu. Each send replaces the previous list wholesale.
     */
    private scheduleAvailableCommands;
    /**
     * Queue a `usage_update` snapshot so clients show the context meter as soon
     * as they attach — new, loaded, resumed, or forked — instead of only after
     * the first prompt completes. `used` is an estimate of the current history
     * (the API reports exact usage only with a completion); the first prompt's
     * real usage replaces it.
     */
    private scheduleUsageUpdate;
    unstable_setSessionModel(params: SetSessionModelRequest): Promise<SetSessionModelResponse>;
    /**
     * Switch a session to a new model id — shared by `session/set_model` and the
     * `model` config option. Uncatalogued ids are allowed on purpose (Z.AI may
     * offer models we haven't catalogued), but log a stderr hint. Persists,
     * notifies clients via `session_info_update`, and pushes a
     * `config_option_update` because the valid thought levels may differ between
     * models (e.g. switching from 5.3 to 4.7 drops the effort ladder).
     */
    private applySessionModel;
    /**
     * Build the SessionConfigOptions we advertise: `thought_level` (levels depend
     * on the model, see {@link getThoughtLevels}), `mode`, and `model`.
     *
     * The `mode` option mirrors {@link modesState} as a `category: "mode"`
     * selector. Clients that render config options (Zed) suppress the legacy mode
     * selector once any config option is advertised, so the permission mode would
     * otherwise be unreachable from their UI. `currentMode` is always read from
     * the live session state, so a mode set through `session/set_mode` shows up
     * here too.
     *
     * The `model` option mirrors {@link modelsState} as a `category: "model"`
     * selector for the same reason: clients that render config options suppress
     * the legacy model selector too, so the active model would otherwise be
     * unreachable. `currentModel` is read from the live session state, so a model
     * set through `session/set_model` shows up here as well.
     */
    private configOptionsState;
    setSessionConfigOption(params: SetSessionConfigOptionRequest): Promise<SetSessionConfigOptionResponse>;
    /**
     * Build the SessionModelState we advertise on session create/load/resume/fork.
     *
     * The active model is always included in `availableModels`, even when it
     * isn't in the advertised list — a session restored from disk can be pinned
     * to a de-listed id (`glm-5.2` was the previous default), and `ACP_GLM_MODEL`
     * / `session/set_model` both accept uncatalogued ids on purpose. Returning a
     * `currentModelId` outside the advertised set leaves pickers unable to
     * represent the selection the agent is actually using.
     */
    private modelsState;
    /** Build the SessionModeState we advertise on session create/load/resume/fork. */
    private modesState;
    setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse>;
    prompt(params: PromptRequest): Promise<PromptResponse>;
    cancel(params: CancelNotification): Promise<void>;
    closeSession(params: CloseSessionRequest): Promise<void>;
    listSessions(params: ListSessionsRequest): Promise<ListSessionsResponse>;
    loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse>;
    unstable_forkSession(params: ForkSessionRequest): Promise<ForkSessionResponse>;
    resumeSession(params: ResumeSessionRequest): Promise<ResumeSessionResponse>;
    private snapshot;
    private persistSession;
    private requirePersisted;
    private replayMessages;
    /**
     * Runs the full prompt/tool-calling loop until the model stops or is cancelled.
     *
     * Returns the ACP stop reason and optional token usage reported by the model.
     */
    private runPromptLoop;
    private mapStopReason;
    /** Tool schemas we expose for agent-owned local tools plus session MCP tools. */
    private availableToolDefinitions;
}
//# sourceMappingURL=agent.d.ts.map