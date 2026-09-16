/**
 * Debug logging for the GLM ACP agent.
 *
 * Set `ACP_GLM_DEBUG=true` to enable verbose logging to stderr.
 * `warn()` and `error()` always write to stderr regardless of the debug flag.
 */
const DEBUG_ENABLED = typeof process === "object" &&
    typeof process.env === "object" &&
    (process.env["ACP_GLM_DEBUG"] === "true" || process.env["ACP_GLM_DEBUG"] === "1");
function timestamp() {
    return new Date().toISOString().slice(11, 23);
}
function write(level, ...args) {
    const prefix = `[glm-acp-agent] ${timestamp()} [${level}]`;
    process.stderr.write(`${prefix} ${args.join(" ")}\n`);
}
/** Log a debug message. Only writes when `ACP_GLM_DEBUG=true`. */
export function debug(...args) {
    if (DEBUG_ENABLED)
        write("DEBUG", ...args);
}
/** Log a warning. Always written to stderr. */
export function warn(...args) {
    write("WARN", ...args);
}
/** Log an error. Always written to stderr. */
export function error(...args) {
    write("ERROR", ...args);
}
/** Mask all but the last 4 characters of a string (e.g. API key). */
export function maskSecret(s) {
    if (s.length <= 4)
        return "****";
    return "****" + s.slice(-4);
}
/** Returns true when debug logging is active (`ACP_GLM_DEBUG=true`). */
export function isDebugEnabled() {
    return DEBUG_ENABLED;
}
/** Reset the DEBUG_ENABLED flag (used in tests). */
export function _resetDebugEnabled() {
    // no-op in production; tests monkey-patch this module's internals.
}
//# sourceMappingURL=logger.js.map