/**
 * Parse `--max-turns <n>` (or `--max-turns=<n>`) from CLI args.
 * Returns `undefined` only when the flag is absent; invalid input selects the
 * default (100), never `$ACP_GLM_MAX_TURNS` — explicit-but-bad CLI input must
 * not silently fall through to the env var.
 */
export declare function parseMaxTurnsFlag(argv: string[]): number | undefined;
//# sourceMappingURL=cli-args.d.ts.map