# feat: system prompt knows its own provider and model

## Provenance

- main: `047dde4` — 2026-09-16
- upstream-rebrand: n/a — this repo's history is the fork's own commits; no upstream remote is merged on a cadence
- upstream/main: n/a (untagged)

## Scope

**In scope:**

1. `buildSystemPrompt` accepts the session's provider id and model name and renders 2 new lines in the `<environment>` block: provider and model.
2. `newSession` threads the session's actual model into the prompt build (the value already computed there).
3. A new bullet in the `<tools>` section: the model's own provider/model (see environment) is the default when spawning subagents — omit the provider argument rather than looking it up; specify one only when the user asks, and if tools for listing providers/models are available, verify the requested one there, otherwise use the user's naming as given.
4. A `*.rambla.test.ts` in `src/tests/` (where this repo's test runner globs) covering the new environment lines and the new bullet.

**Not in scope:**

- Rebuilding `messages[0]` on `session/set_model` (mid-session model switches leave the prompt stating the initial model; accepted for now, noted in Risks).
- Any change to tool definitions, the daemon-injected `create_agent` tool, or load/fork/resume prompt restoration.
- Rewording any existing prompt block beyond the 2 additions above.

## Goal

The model is told which provider and model it runs as, and defaults subagent spawns to itself instead of guessing another vendor.

## Merge conflict mitigation

This is a fork of the upstream glm-acp-agent. Upstream merges are occasional, not weekly, so the same placement discipline applies with lighter pressure.

**Files this work changes:**

| File                                  | Edit                                                                                     | Upstream activity                        | Tag                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------- |
| `src/protocol/system-prompt.ts`       | `BuildSystemPromptInput` gains 2 fields; `renderEnvironment` gains 2 lines; `TOOLS_TEMPLATE` gains 1 bullet | fork-diverged already (1bbce24, 958a41a); upstream last touched it at 9291301 | `RAMBLA-FORK: feat:` |
| `src/protocol/agent.ts`               | `newSession` passes model (and constant provider id) into `buildSystemPrompt` — a few lines at the existing call site | active fork file; upstream last touched at 9291301 | `RAMBLA-FORK: feat:` |
| `src/tests/system-prompt.rambla.test.ts` | covers environment lines and the new bullet                                         | new                                      | `RAMBLA-FORK: feat:` |

**Why this shape:** the prompt module is small, pure, and already fork-diverged, so editing it in place with tagged blocks is cheaper than shimming a `*.rambla.ts` override around it; the test goes in a new file so upstream test files stay untouched.

**Branch:** none — 2 upstream files edited, within the small-change threshold, work on main.

## Cause

Not a fix — a capability gap. The prompt's `<environment>` block ([system-prompt.ts](../src/protocol/system-prompt.ts), `renderEnvironment`) lists cwd, platform, shell, Node, and date but never the provider or model, so a hosted session has no in-band identity and cannot default subagent spawns to itself.

## Constraints

- No file outside the mitigation table changes.
- No prompt text changes beyond the additions in scope — existing blocks stay byte-identical.
- No reading of env vars beyond what `newSession` already does; provider id comes from the agent's own constant, model from the session's computed value.
- No compaction or message-persistence changes; the prompt stays in `messages[0]` as today.
- Upstream test files untouched.

## Steps

0. Read the `code` skill before writing anything. If a step below turns out to be wrong, stop and report back to the supervisor — do not amend this plan and do not re-decide placement while coding.
1. In `system-prompt.ts`: add `provider: string` and `model: string` to `BuildSystemPromptInput`; render them as the 2 environment lines per scope item 1; add the tools bullet per scope item 3.
2. In `agent.ts` `newSession`: move the model computation above the `buildSystemPrompt` call and pass both fields. Tag the block with the plan's fork tag.
3. Create `src/tests/system-prompt.rambla.test.ts` asserting the 2 environment lines and the tools bullet appear in the built prompt.

## Verification

- Typecheck and lint per this repo's scripts (`npm run` equivalents — confirm names in `package.json` before running).
- Run the new `src/tests/system-prompt.rambla.test.ts` via `npm test` (the runner compiles and executes `dist/tests/*.test.js`).
- Start a session and confirm the first system message contains `Provider: glm-acp-agent` and the session's model line.

## Risks

- After a mid-session `session/set_model`, the prompt still names the initial model until the session is restarted or compacted (compaction rebuilds from `messages[0]`, which would then be stale). Accepted in this plan; a follow-up can rebuild the prompt in `applySessionModel`.
- Tests that snapshot the full prompt byte-for-byte, if any exist, will need their snapshots regenerated — check before running the suite.
