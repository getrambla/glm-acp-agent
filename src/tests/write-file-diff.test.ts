import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolExecutor } from "../tools/executor.js";

// Tests for write_file's diff reporting: every write emits an ACP diff
// content block — old vs new for overwrites, all-additions for new files —
// so the client can show what the write does before and after approval.

interface StubOptions {
  permission?: "allow" | "reject" | "cancelled";
}

function createConnectionStub(opts: StubOptions = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const permissionRequests: Array<unknown> = [];
  const clientReads: string[] = [];
  const clientWrites: Array<{ path: string; content: string }> = [];
  return {
    updates,
    permissionRequests,
    clientReads,
    clientWrites,
    async sessionUpdate(payload: Record<string, unknown>) {
      updates.push(payload);
    },
    // The ACP client's fs capability, backed by real disk so error codes
    // (ENOENT, EACCES) survive the round trip like a real client's would.
    async readTextFile({ path }: { path: string }) {
      clientReads.push(path);
      return { content: readFileSync(path, "utf8") };
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      clientWrites.push({ path, content });
      writeFileSync(path, content, "utf8");
    },
    async requestPermission(params: unknown) {
      permissionRequests.push(params);
      switch (opts.permission ?? "allow") {
        case "allow":
          return { outcome: { outcome: "selected", optionId: "allow" } };
        case "reject":
          return { outcome: { outcome: "selected", optionId: "reject" } };
        case "cancelled":
          return { outcome: { outcome: "cancelled" } };
      }
    },
  };
}

const FULL_CAPS = { fs: { readTextFile: true, writeTextFile: true }, terminal: true };
const NO_FS_CAPS = { fs: { readTextFile: false, writeTextFile: false }, terminal: true };

interface UpdateShape {
  sessionUpdate: string;
  status?: string;
  content?: Array<{ type: string; path?: string; oldText?: string; newText?: string }>;
  rawOutput?: Record<string, unknown>;
}

function updatesOf(conn: ReturnType<typeof createConnectionStub>): UpdateShape[] {
  return conn.updates.map((u) => u.update as UpdateShape);
}

function diffBlock(update: UpdateShape | undefined) {
  return update?.content?.find((c) => c.type === "diff");
}

test("write_file overwriting an existing file emits old/new in the diff block", async () => {
  const dir = mkdtempSync(join(tmpdir(), "glm-write-diff-"));
  try {
    const path = join(dir, "code.ts");
    const original = "const a = 1;\n";
    const updated = "const a = 2;\nconst b = 3;\n";
    writeFileSync(path, original, "utf8");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "write_file",
      JSON.stringify({ path, content: updated, overwrite: true })
    );
    assert.match(result.content, /written successfully/);
    assert.equal(readFileSync(path, "utf8"), updated);

    const [announce, , completed] = updatesOf(conn);
    // Both the pending announcement (permission popup) and the completed
    // update carry the same diff block.
    for (const [label, update] of [
      ["announce", announce],
      ["completed", completed],
    ] as const) {
      const diff = diffBlock(update);
      assert.ok(diff, `${label} carries a diff content block`);
      assert.equal(diff?.path, path);
      assert.equal(diff?.oldText, original);
      assert.equal(diff?.newText, updated);
    }
    assert.equal(completed?.status, "completed");
    // No text content block: tool text would render as a pseudo-diff.
    assert.equal(
      completed?.content?.some((c) => c.type === "content"),
      false,
      "completed update has no text content block"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write_file creating a new file emits an additions-only diff block (no oldText)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "glm-write-diff-"));
  try {
    const path = join(dir, "fresh.txt");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    await exec.execute("tc1", "write_file", JSON.stringify({ path, content: "hello\n" }));

    const [announce, , completed] = updatesOf(conn);
    for (const [label, update] of [
      ["announce", announce],
      ["completed", completed],
    ] as const) {
      const diff = diffBlock(update);
      assert.ok(diff, `${label} carries a diff content block`);
      assert.equal(diff?.path, path);
      assert.equal(
        "oldText" in (diff ?? {}),
        false,
        `${label} diff has no oldText for a new file`
      );
      assert.equal(diff?.newText, "hello\n");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write_file fails when the file exists but cannot be read", async () => {
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  if (isRoot) return; // chmod-based read failure does not apply to root
  const dir = mkdtempSync(join(tmpdir(), "glm-write-diff-"));
  try {
    const path = join(dir, "locked.txt");
    writeFileSync(path, "secret\n", "utf8");
    chmodSync(path, 0o000);
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "write_file",
      JSON.stringify({ path, content: "x" })
    );
    assert.match(result.content, /Error/);
    const updates = updatesOf(conn);
    assert.equal(updates.at(-1)?.status, "failed");
    // No re-read here: the file is locked; a failed call must simply not have written.
  } finally {
    chmodSync(join(dir, "locked.txt"), 0o644);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write_file routes the pre-write read and the write through the client fs capability", async () => {
  const dir = mkdtempSync(join(tmpdir(), "glm-write-diff-"));
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "old\n", "utf8");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    await exec.execute("tc1", "write_file", JSON.stringify({ path, content: "new\n", overwrite: true }));
    assert.deepEqual(conn.clientReads, [path], "the old-vs-new diff reads through the client");
    assert.deepEqual(conn.clientWrites, [{ path, content: "new\n" }]);
    assert.equal(readFileSync(path, "utf8"), "new\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write_file uses local disk when the client advertises no fs capability", async () => {
  const dir = mkdtempSync(join(tmpdir(), "glm-write-diff-"));
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "old\n", "utf8");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", NO_FS_CAPS, undefined, null, null, dir);

    await exec.execute("tc1", "write_file", JSON.stringify({ path, content: "new\n", overwrite: true }));
    assert.deepEqual(conn.clientReads, []);
    assert.deepEqual(conn.clientWrites, []);
    assert.equal(readFileSync(path, "utf8"), "new\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write_file keeps its lifecycle sequence and failure paths alongside the diff", async () => {
  const dir = mkdtempSync(join(tmpdir(), "glm-write-diff-"));
  try {
    const path = join(dir, "y.txt");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    await exec.execute("tc1", "write_file", JSON.stringify({ path, content: "data" }));
    assert.deepEqual(
      updatesOf(conn).map((u) => ({ type: u.sessionUpdate, status: u.status })),
      [
        { type: "tool_call", status: "pending" },
        { type: "tool_call_update", status: "in_progress" },
        { type: "tool_call_update", status: "completed" },
      ]
    );

    const rejectConn = createConnectionStub({ permission: "reject" });
    const rejectExec = new ToolExecutor(
      rejectConn as never,
      "s1",
      FULL_CAPS,
      undefined,
      null,
      null,
      dir
    );
    const rejected = await rejectExec.execute(
      "tc2",
      "write_file",
      JSON.stringify({ path, content: "nope", overwrite: true })
    );
    assert.match(rejected.content, /rejected by user/i);
    assert.equal(updatesOf(rejectConn).at(-1)?.status, "failed");
    assert.equal(readFileSync(path, "utf8"), "data", "reject leaves the file untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
