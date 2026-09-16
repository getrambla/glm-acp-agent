import type { PromptRequest } from "@agentclientprotocol/sdk";
import type { VisionMcpClient } from "../tools/vision-mcp-client.js";
type Block = PromptRequest["prompt"][number];
export interface PreprocessedPrompt {
    blocks: Block[];
    cleanups: Array<() => Promise<void>>;
}
/**
 * Replace every ACP image block with a text annotation containing the result
 * of a Vision MCP `image_analysis` call. ACP image blocks may carry a usable
 * URI (passed through as-is) or only inline base64 `data` (we materialize that
 * to an OS temp file and pass the path; cleanup callbacks remove it later).
 *
 * Failures from the vision client are degraded into `<image_analysis_error>`
 * annotations so a vision outage cannot crash a prompt that happens to
 * include an image.
 */
export declare function preprocessImageBlocks(blocks: ReadonlyArray<Block>, visionClient: VisionMcpClient | null, signal?: AbortSignal): Promise<PreprocessedPrompt>;
/**
 * Build a list of safe, redacted diagnostic lines describing the inbound ACP
 * prompt blocks. Intended for debug logging — callers must guard with
 * `isDebugEnabled()` before calling so the string work is skipped in prod.
 *
 * Safety rules:
 * - Image blocks: log MIME, URI presence, and approximate decoded byte length.
 *   Never log the base64 payload.
 * - Resource/resource-link blocks: log the URI scheme + path basename only
 *   (no full paths, no query strings, no data: payloads).
 */
export declare function buildPromptBlockDiagnosticLines(blocks: ReadonlyArray<Block>): string[];
export {};
//# sourceMappingURL=image-preprocessor.d.ts.map