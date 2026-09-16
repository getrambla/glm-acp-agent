/** Represents a tool discovered via `tools/list`, including its schema property names. */
export interface DiscoveredTool {
    name: string;
    properties: string[];
}
/**
 * Remaps argument keys to match the upstream MCP tool's `inputSchema.properties`.
 * - If a key already matches a target property, it is passed through unchanged.
 * - Otherwise, the alias table is consulted; if the alias exists in the target properties, the key is remapped.
 * - If no schema is available (empty `targetProperties`), all arguments are passed through unchanged.
 */
export declare function remapArguments(requestedArgs: Record<string, unknown>, targetProperties: string[]): Record<string, unknown>;
/**
 * Resolves a requested tool name against the list of available tools discovered via `tools/list`.
 * - Exact match takes priority.
 * - Falls back to keyword-based search (e.g. "search", "reader", "image").
 * - If `availableTools` is empty (discovery not available), returns `requestedName` unchanged.
 * - Throws a descriptive error if no match is found.
 */
export declare function resolveToolName(requestedName: string, availableTools: string[], context: string): string;
//# sourceMappingURL=mcp-arg-remap.d.ts.map