/**
 * Interactive setup flow that prompts the user for a Z.AI API key on stdin and
 * persists it to the credentials file. Invoked when the binary is run with
 * `--setup` so users can configure the agent without leaking the key into
 * their shell history.
 */
export declare function runSetup(input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream): Promise<void>;
//# sourceMappingURL=setup.d.ts.map