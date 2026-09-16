/** The npm identity the registry manifest must mirror. */
export interface PackageIdentity {
    name: string;
    version: string;
}
/**
 * Rewrite an agent.json manifest so both version pins match the package.
 *
 * The pins are updated through the parsed object — `version` and
 * `distribution.npx.package` by path — so a nested `"version"` field or a
 * sibling distribution pin elsewhere in the manifest can neither be mistaken
 * for the real pins nor silently clobbered. Anything unexpected —
 * unparseable JSON, a missing field, or a pin no longer targeting this
 * package — throws instead of shipping a half-synced manifest.
 *
 * Output uses normalized `JSON.stringify` formatting: an unnormalized input
 * is rewritten once, and every later sync is byte-stable.
 */
export declare function syncManifestContent(content: string, pkg: PackageIdentity): string;
//# sourceMappingURL=sync-manifest.d.ts.map