import type { GlmMessage, ThoughtLevel } from "../llm/glm-client.js";
/**
 * Schema version embedded in every persisted session file. Bump whenever the
 * shape of `PersistedSession` changes incompatibly so future loaders can
 * migrate (or reject) old records instead of silently producing garbage.
 */
export declare const SESSION_SCHEMA_VERSION: 4;
/**
 * On-disk representation of a session. Only fields that need to survive a
 * process restart are persisted — `abortController` / `promptPromise` are
 * transient state that has no meaning across processes.
 */
export interface PersistedSession {
    /** Schema version of this on-disk record (see SESSION_SCHEMA_VERSION). */
    schemaVersion?: number;
    sessionId: string;
    cwd: string;
    messages: GlmMessage[];
    title: string | null;
    updatedAt: string;
    model: string;
    /**
     * Permission mode for this session. Defaults to "default" for persisted
     * sessions from schema versions that didn't include this field.
     */
    mode: "default" | "accept_edits" | "bypass_permissions";
    /**
     * Reasoning effort level, controlled via the `thought_level` config option.
     * Optional so sessions persisted before this field was added still parse;
     * the migration (and load-time resolution) default it to "max".
     */
    thoughtLevel?: ThoughtLevel;
    /**
     * Replay text for user messages whose stored `content` differs from what the
     * user actually typed — a slash command expanded into its body, an image
     * replaced by its vision annotation. Keys are indices into `messages`;
     * entries are written only where the two texts diverge, so an ordinary
     * conversation persists no sidecar at all.
     *
     * Indices are re-derived from message identity on every save, so they stay
     * correct across the compaction that drops turns from `messages`.
     */
    displayText?: Record<string, string>;
}
/** Light-weight summary of a persisted session — used by `listSessions`. */
export interface PersistedSessionMetadata {
    sessionId: string;
    cwd: string;
    title: string | null;
    updatedAt: string;
    model: string;
    mode: "default" | "accept_edits" | "bypass_permissions";
}
/**
 * File-backed session store. Each session lives in its own JSON file so we can
 * grow/shrink linearly with the number of conversations and avoid locking a
 * single shared file.
 */
export declare class SessionStore {
    private dir;
    constructor(dir?: string);
    /** Resolve the path for a given sessionId. */
    private pathFor;
    /** Persist a session, creating directories as needed. */
    save(session: PersistedSession): void;
    /** Load a session by id, returning undefined if no such file exists. */
    load(sessionId: string): PersistedSession | undefined;
    /**
     * List metadata for all persisted sessions, sorted newest-first by
     * `updatedAt`. This is the hot path for `session/list`; we still parse each
     * file (single-file-per-session has no shared index), but discard the
     * `messages` array immediately so memory usage scales with the number of
     * sessions, not their length.
     */
    listMetadata(): PersistedSessionMetadata[];
}
//# sourceMappingURL=session-store.d.ts.map