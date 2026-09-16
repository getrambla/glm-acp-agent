/** Path to the credentials JSON file. Honours `$XDG_CONFIG_HOME`. */
export declare function credentialsPath(): string;
/** Read the API key from the credentials file, returning undefined if absent. */
export declare function readCredentialsKey(path?: string): string | undefined;
/**
 * Resolve the API key: env var > credentials file. Returns undefined when
 * neither source has one set.
 */
export declare function resolveApiKey(): string | undefined;
/**
 * Write the API key to the credentials file. Restricts the file to mode 0600
 * so it isn't world-readable on shared machines.
 */
export declare function writeCredentials(apiKey: string, path?: string): void;
//# sourceMappingURL=credentials.d.ts.map