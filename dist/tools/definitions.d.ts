/**
 * Tool JSON schemas exposed to the GLM model.
 *
 * These definitions follow the OpenAI function-calling format and map
 * directly to ToolExecutor implementations. Local file and shell tools run in
 * the agent process; writes and command execution still ask the ACP client for
 * permission before doing anything.
 */
export interface ToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
export declare const TOOL_DEFINITIONS: ToolDefinition[];
//# sourceMappingURL=definitions.d.ts.map