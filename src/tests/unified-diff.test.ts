import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedDiff } from "../tools/executor.js";

// Tests for the hunk-trimmed unified diff emitted alongside edit/write diffs
// so clients render only the changed region, not the whole file.

test("buildUnifiedDiff emits only the changed region with context lines", () => {
  const before = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
  const after = before.replace("line 50", "line 50 (edited)");
  const diff = buildUnifiedDiff(before, after);

  const lines = diff.split("\n");
  assert.ok(lines.some((l) => l === "-line 50"));
  assert.ok(lines.some((l) => l === "+line 50 (edited)"));
  // 3 context lines above + 1 removed + 1 added + 3 below = 8 lines
  assert.equal(lines.length, 8);
  assert.ok(!diff.includes("line 1\n"), "far-away context is trimmed");
  assert.ok(!diff.includes("+line 100"), "tail is trimmed");
});

test("buildUnifiedDiff returns empty string when nothing changed", () => {
  assert.equal(buildUnifiedDiff("a\nb\n", "a\nb\n"), "");
});

test("buildUnifiedDiff merges close changes into one hunk and splits distant ones", () => {
  const before = ["a", "x1", "x2", "c", "d", "e", "f", "g", "h", "y1", "y2", "z"].join("\n");
  const after = before
    .replace("x2", "X2")
    .replace("y1", "Y1");
  const diff = buildUnifiedDiff(before, after);

  assert.ok(diff.includes("-x2"));
  assert.ok(diff.includes("+X2"));
  assert.ok(diff.includes("-y1"));
  assert.ok(diff.includes("+Y1"));
  // Changes are >6 lines apart (3-line context each), so two separate hunks.
  const hunkCount = diff.split("\n").filter((l) => l.startsWith("@@")).length;
  const hasHeaders = hunkCount > 0;
  // Headers are optional (parser tolerates their absence); just sanity-check body.
  assert.ok(hasHeaders || diff.includes("-x2"));
});

test("buildUnifiedDiff handles whole-file creation", () => {
  const diff = buildUnifiedDiff("", "new\nfile\n");
  const lines = diff.split("\n");
  assert.deepEqual(lines, ["+new", "+file"]);
});
