/** Log a debug message. Only writes when `ACP_GLM_DEBUG=true`. */
export declare function debug(...args: unknown[]): void;
/** Log a warning. Always written to stderr. */
export declare function warn(...args: unknown[]): void;
/** Log an error. Always written to stderr. */
export declare function error(...args: unknown[]): void;
/** Mask all but the last 4 characters of a string (e.g. API key). */
export declare function maskSecret(s: string): string;
/** Returns true when debug logging is active (`ACP_GLM_DEBUG=true`). */
export declare function isDebugEnabled(): boolean;
/** Reset the DEBUG_ENABLED flag (used in tests). */
export declare function _resetDebugEnabled(): void;
//# sourceMappingURL=logger.d.ts.map