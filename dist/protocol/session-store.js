import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * Schema version embedded in every persisted session file. Bump whenever the
 * shape of `PersistedSession` changes incompatibly so future loaders can
 * migrate (or reject) old records instead of silently producing garbage.
 */
export const SESSION_SCHEMA_VERSION = 4;
/** Resolve the directory we write session files to, honouring overrides. */
function defaultSessionDir() {
    const explicit = process.env["ACP_GLM_SESSION_DIR"];
    if (explicit && explicit.length > 0)
        return explicit;
    const xdg = process.env["XDG_STATE_HOME"];
    const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".local", "state");
    return join(base, "glm-acp-agent", "sessions");
}
/**
 * File-backed session store. Each session lives in its own JSON file so we can
 * grow/shrink linearly with the number of conversations and avoid locking a
 * single shared file.
 */
export class SessionStore {
    dir;
    constructor(dir = defaultSessionDir()) {
        this.dir = dir;
    }
    /** Resolve the path for a given sessionId. */
    pathFor(sessionId) {
        // sessionId is generated via randomUUID() so it's path-safe; reject
        // anything else defensively to avoid path traversal.
        if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
            throw new Error(`Invalid sessionId: ${sessionId}`);
        }
        return join(this.dir, `${sessionId}.json`);
    }
    /** Persist a session, creating directories as needed. */
    save(session) {
        mkdirSync(this.dir, { recursive: true, mode: 0o700 });
        const path = this.pathFor(session.sessionId);
        // Write the schema version *after* the spread so the constant always wins,
        // even if a caller accidentally sets `schemaVersion` on the input.
        const body = {
            ...session,
            schemaVersion: SESSION_SCHEMA_VERSION,
        };
        writeFileSync(path, JSON.stringify(body, null, 2) + "\n", { mode: 0o600 });
    }
    /** Load a session by id, returning undefined if no such file exists. */
    load(sessionId) {
        let raw;
        try {
            raw = readFileSync(this.pathFor(sessionId), "utf8");
        }
        catch {
            return undefined;
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            return undefined;
        }
        // Handle schema migrations. We support v1 (pre-modes), v2 (with mode
        // field), v3 (with thoughtLevel), and v4 (with displayText). Defaulting
        // thoughtLevel to "max" is safe: it's GLM-5.3's own default effort, and
        // load-time resolution clamps it to a valid level for the session's
        // actual model. `displayText` needs no backfill — its absence already
        // means "replay the stored content", which is what older records did.
        const version = parsed.schemaVersion ?? 1;
        if (version === 1) {
            // Migration: add mode + thoughtLevel fields with default values.
            return {
                ...parsed,
                mode: "default",
                thoughtLevel: "max",
                schemaVersion: SESSION_SCHEMA_VERSION,
            };
        }
        if (version === 2) {
            // Migration: add thoughtLevel field with default value.
            return {
                ...parsed,
                thoughtLevel: "max",
                schemaVersion: SESSION_SCHEMA_VERSION,
            };
        }
        if (version === 3) {
            // Migration: no new data to backfill, just retag at the current version.
            return { ...parsed, schemaVersion: SESSION_SCHEMA_VERSION };
        }
        if (version !== SESSION_SCHEMA_VERSION) {
            // Forward-incompatible record written by a newer agent build.
            return undefined;
        }
        return parsed;
    }
    /**
     * List metadata for all persisted sessions, sorted newest-first by
     * `updatedAt`. This is the hot path for `session/list`; we still parse each
     * file (single-file-per-session has no shared index), but discard the
     * `messages` array immediately so memory usage scales with the number of
     * sessions, not their length.
     */
    listMetadata() {
        let entries;
        try {
            entries = readdirSync(this.dir);
        }
        catch {
            return [];
        }
        const out = [];
        for (const name of entries) {
            if (!name.endsWith(".json"))
                continue;
            const sessionId = name.slice(0, -".json".length);
            const sess = this.load(sessionId);
            if (!sess)
                continue;
            out.push({
                sessionId: sess.sessionId,
                cwd: sess.cwd,
                title: sess.title,
                updatedAt: sess.updatedAt,
                model: sess.model,
                mode: sess.mode,
            });
        }
        out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
        return out;
    }
}
//# sourceMappingURL=session-store.js.map