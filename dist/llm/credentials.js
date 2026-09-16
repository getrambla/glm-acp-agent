import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { debug, maskSecret } from "./logger.js";
/** Path to the credentials JSON file. Honours `$XDG_CONFIG_HOME`. */
export function credentialsPath() {
    const xdg = process.env["XDG_CONFIG_HOME"];
    const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
    return join(base, "glm-acp-agent", "credentials.json");
}
/** Read the API key from the credentials file, returning undefined if absent. */
export function readCredentialsKey(path = credentialsPath()) {
    try {
        const raw = readFileSync(path, "utf8");
        const parsed = JSON.parse(raw);
        const key = parsed.z_ai_api_key;
        return typeof key === "string" && key.length > 0 ? key : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Resolve the API key: env var > credentials file. Returns undefined when
 * neither source has one set.
 */
export function resolveApiKey() {
    const fromEnv = process.env["Z_AI_API_KEY"];
    if (typeof fromEnv === "string" && fromEnv.length > 0) {
        debug(`resolveApiKey: source=env key=${maskSecret(fromEnv)}`);
        return fromEnv;
    }
    const fromFile = readCredentialsKey();
    if (fromFile) {
        debug(`resolveApiKey: source=file key=${maskSecret(fromFile)}`);
    }
    else {
        debug("resolveApiKey: no key found");
    }
    return fromFile;
}
/**
 * Write the API key to the credentials file. Restricts the file to mode 0600
 * so it isn't world-readable on shared machines.
 */
export function writeCredentials(apiKey, path = credentialsPath()) {
    if (!apiKey || apiKey.length === 0) {
        throw new Error("Refusing to write empty API key");
    }
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const body = { z_ai_api_key: apiKey };
    writeFileSync(path, JSON.stringify(body, null, 2) + "\n", { mode: 0o600 });
}
//# sourceMappingURL=credentials.js.map