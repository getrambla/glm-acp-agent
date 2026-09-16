/**
 * Assembles the system prompt seeded into every new session.
 *
 * `glm-acp-agent` is a *native* ACP agent — it owns the LLM call rather than
 * delegating to a vendor SDK that supplies its own prompt. This module brings
 * us in line with native-ACP norms (cf. crow-cli, kimi-cli) by giving the
 * model an explicit environment block, tool-use rules, file-system / version-
 * control guardrails, and an optional `<project_context>` section sourced
 * from the project's `AGENTS.md` / `CLAUDE.md`.
 *
 * The function is pure: I/O (reading AGENTS.md, capping its size) is the
 * caller's responsibility. This keeps the prompt content unit-testable and
 * lets the caller decide when to refresh project context (today: once at
 * `newSession` time).
 */
export interface BuildSystemPromptInput {
    /** The session's working directory, advertised to the model as the project root. */
    cwd: string;
    /** Names of tools available for this session, in declaration order. */
    tools: ReadonlyArray<string>;
    /**
     * Optional project context drawn from `AGENTS.md` (preferred) or `CLAUDE.md`.
     * Caller is responsible for capping the byte size before passing it in.
     * `undefined` or empty string means no file was found / loaded.
     */
    agentsMd?: string;
}
export declare function buildSystemPrompt(input: BuildSystemPromptInput): string;
//# sourceMappingURL=system-prompt.d.ts.map