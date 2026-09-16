import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import type { ModelInfo, Usage } from "@agentclientprotocol/sdk";
import { type ToolDefinition } from "../tools/definitions.js";
/**
 * Reasoning effort levels exposed to ACP clients via the `thought_level`
 * SessionConfigOption. These map onto Z.AI's `thinking` / `reasoning_effort`
 * request parameters (see {@link buildThinkingParams}).
 *
 * GLM-5.3 (and GLM-5.2 / GLM-5.1, which the Coding Plan endpoint serves with
 * 5.3) supports the full effort ladder: `minimal | low | medium | high |
 * xhigh | max`. GLM-5.3-Flash only honours `low | high | max`. Other
 * thinking-capable models (5-turbo, 4.7, …) only distinguish thinking on vs.
 * off, so they use `none` and `on`.
 */
export type ThoughtLevel = "none" | "on" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
/** Type guard: whether an arbitrary string is a known ThoughtLevel. */
export declare function isThoughtLevel(value: string): value is ThoughtLevel;
/**
 * Resolve which thought-level options a model supports.
 *
 * Only the GLM-5.3 family honours `reasoning_effort`; on `glm-5-turbo` and
 * `glm-4.7` the endpoint accepts the field without validating it and the
 * response depth does not change, so those models only get on/off.
 * GLM-5.3-Flash is a 5.3-family model but only the three documented levels.
 */
export declare function getThoughtLevels(model: string): ThoughtLevel[];
/**
 * Resolve a stored ThoughtLevel to one that's valid for the given model.
 * Used when switching models or restoring a persisted session: if the old
 * level isn't in the new model's option list, fall back to the model's
 * default (max on 5.3 / Flash, on for everything else — the last entry in
 * the list). Switching from GLM-5.3 onto Flash maps the six-rung ladder
 * onto Flash's three documented values rather than collapsing everything
 * to max.
 */
export declare function resolveThoughtLevel(model: string, level: ThoughtLevel): ThoughtLevel;
/**
 * A single message in the GLM conversation history.
 */
export type GlmMessage = ChatCompletionMessageParam;
/**
 * A streamed chunk from the GLM API.
 */
export interface GlmStreamChunk {
    /** Incremental assistant text */
    text?: string;
    /** Incremental reasoning/thinking text */
    thinking?: string;
    /** A complete tool call (assembled from streaming deltas) */
    toolCall?: {
        id: string;
        name: string;
        arguments: string;
    };
    /** Token usage reported when the stream finishes */
    usage?: Usage;
    /** Set when the stream is done */
    done?: boolean;
    /** Stop reason when done */
    stopReason?: string;
}
/** Options applied to a single `streamChat` call. */
export interface StreamChatOptions {
    /** GLM model identifier to use for this call. */
    model: string;
    /** Tool schemas available in this specific session. */
    tools?: ToolDefinition[];
    /** Reasoning effort for this call, or undefined to use the model defaults. */
    reasoningEffort?: ThoughtLevel;
}
/** Default GLM model when neither client nor user has chosen one. */
export declare const DEFAULT_MODEL = "glm-5.3";
/**
 * Z.AI / Zhipu AI error code returned when the total prompt length (messages +
 * tools) exceeds the model's context window.
 */
export declare const ERR_CONTEXT_OVERFLOW = 1261;
export declare function isVisionNativeModel(modelId: string): boolean;
/**
 * Resolve the context window size for a given model ID. Falls back to a safe
 * default (128K) for uncatalogued models.
 */
export declare function getContextWindow(modelId: string): number;
/**
 * Resolve the list of advertised models, allowing the user to override the
 * built-in list via `ACP_GLM_AVAILABLE_MODELS`.
 */
export declare function getAvailableModels(): ModelInfo[];
/** Default model for new sessions: env override → built-in default. */
export declare function getDefaultModel(): string;
/**
 * Wrapper around the OpenAI-compatible Zhipu AI (Z.AI) API.
 *
 * Uses the standard `openai` npm package pointed at `https://api.z.ai/api/paas/v4`
 * so no Zhipu-specific SDK is required. The Z.AI service speaks the OpenAI
 * Chat Completions wire format, plus a few GLM-specific extras (like the
 * `thinking` field and `delta.reasoning_content` for reasoning tokens).
 */
export declare class GlmClient {
    private client;
    private maxTokens;
    constructor();
    /**
     * Stream a chat completion from the GLM model, yielding chunks as they arrive.
     *
     * Reasoning/thinking tokens (from GLM "thinking" mode) are mapped to
     * `thinking` chunks so the ACP agent can forward them as `agent_thought_chunk`
     * blocks.
     */
    streamChat(messages: GlmMessage[], signal?: AbortSignal, options?: StreamChatOptions): AsyncGenerator<GlmStreamChunk>;
}
/**
 * Build the Z.AI `thinking` / `reasoning_effort` extra-body params for a call.
 *
 * Z.AI exposes two parameters:
 * - `thinking` — an on/off gate: `{"type":"enabled"}` or `{"type":"disabled"}`
 * - `reasoning_effort` — controls thinking depth. The endpoint validates it
 *   against `none | minimal | low | medium | high | xhigh | max` (an invalid
 *   value returns business code 1210) but only the GLM-5.3 family acts on it.
 *
 * {@link ThoughtLevel} values map as follows:
 * - `none` → thinking disabled
 * - `on`   → thinking enabled (no reasoning_effort)
 * - `minimal` … `max` → thinking enabled + reasoning_effort=<level>
 *   (5.3 family only)
 *
 * Caveat: GLM-5.3 and GLM-5.3-Flash reject `thinking: { type: "disabled" }`
 * (it is no longer a silent no-op). `none` is therefore not offered as a
 * level for those models (see {@link getThoughtLevels}), and
 * `ACP_GLM_THINKING=false` leaves thinking enabled rather than sending
 * `disabled`.
 *
 * The `ACP_GLM_THINKING` env override still wins for models that accept it:
 * `false` forces thinking off, `true` forces it on (ignoring a `none` level).
 * When `effort` is unset the model defaults are used, preserving the
 * pre-thought-level behaviour.
 */
export declare function buildThinkingParams(model: string, effort?: ThoughtLevel): Record<string, unknown>;
//# sourceMappingURL=glm-client.d.ts.map