/** A command discovered on disk, ready to advertise and to expand. */
export interface SlashCommand {
    /** Command name *without* a leading slash — the client prepends it. */
    name: string;
    /** One-line description rendered in the client's slash menu. */
    description: string;
    /** Placeholder for the free text typed after the name; absent when the command takes none. */
    argumentHint?: string;
    /** Markdown body injected into the prompt when the command is invoked. */
    body: string;
    /** Absolute path the definition was read from, quoted back to the model. */
    source: string;
}
/**
 * Collect the commands available to a session rooted at `cwd`, sorted by name.
 *
 * Project commands shadow user-level ones, and within a root a `commands/` file
 * shadows a same-named skill — first writer wins, so roots are visited in
 * precedence order.
 */
export declare function discoverSlashCommands(cwd: string): SlashCommand[];
/** A parsed `/name rest` prompt. */
export interface ParsedSlashCommand {
    command: SlashCommand;
    /** Everything typed after the command name, trimmed; `""` when nothing was. */
    args: string;
}
/**
 * Match a prompt against the known commands. Returns `undefined` for anything
 * that isn't a leading `/name` we advertised, so prose that happens to start
 * with a slash (and unknown commands) still reaches the model untouched.
 */
export declare function parseSlashCommand(text: string, commands: ReadonlyArray<SlashCommand>): ParsedSlashCommand | undefined;
/**
 * Render an invoked command as the user message the model actually sees.
 *
 * The body is presented as instructions rather than as opaque data (unlike
 * `<project_context>`): the user explicitly typed `/name`, so running what that
 * file says *is* the request. `$ARGUMENTS` is substituted where the definition
 * asks for it, which is the convention `.claude/commands` files are written
 * against; otherwise the arguments are appended as their own line.
 */
export declare function renderSlashCommand(parsed: ParsedSlashCommand): string;
//# sourceMappingURL=slash-commands.d.ts.map