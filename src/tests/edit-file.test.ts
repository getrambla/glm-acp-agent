import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolExecutor } from "../tools/executor.js";

// Tests for the edit_file tool: surgical old_string/new_string replacement
// with staleness protection (read fresh from disk, fail on mismatch).

interface StubOptions {
  permission?: "allow" | "reject" | "cancelled";
  permissionError?: string;
  /** Runs while the permission prompt is "open", to simulate a concurrent edit. */
  onPermission?: () => void;
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
      if (opts.permissionError) throw new Error(opts.permissionError);
      permissionRequests.push(params);
      opts.onPermission?.();
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

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "glm-edit-file-"));
  return dir;
}

interface CompletedUpdate {
  status?: string;
  content?: Array<{ type: string; path?: string; oldText?: string; newText?: string }>;
  rawOutput?: Record<string, unknown>;
}

function lastUpdate(conn: ReturnType<typeof createConnectionStub>): CompletedUpdate {
  return (conn.updates.at(-1) as { update: CompletedUpdate }).update;
}

function statusSequence(conn: ReturnType<typeof createConnectionStub>) {
  return conn.updates.map((u) => {
    const update = u.update as { sessionUpdate: string; status?: string };
    return { type: update.sessionUpdate, status: update.status };
  });
}

test("edit_file replaces a unique match, writes to disk, and emits a diff block", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "function add(a, b) {\n  return a + b;\n}\n", "utf8");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({
        path,
        old_string: "return a + b;",
        new_string: "return a + b + 0;",
      })
    );
    assert.match(result.content, /Edited/);
    assert.equal(readFileSync(path, "utf8"), "function add(a, b) {\n  return a + b + 0;\n}\n");
    assert.equal(conn.permissionRequests.length, 1);

    const last = lastUpdate(conn);
    assert.equal(last.status, "completed");
    const diffBlock = last.content?.find((c) => c.type === "diff");
    assert.ok(diffBlock, "completed update carries a diff content block");
    assert.equal(diffBlock?.path, path);
    assert.equal(diffBlock?.oldText, "function add(a, b) {\n  return a + b;\n}\n");
    assert.equal(diffBlock?.newText, "function add(a, b) {\n  return a + b + 0;\n}\n");

    assert.deepEqual(statusSequence(conn), [
      { type: "tool_call", status: "pending" },
      { type: "tool_call_update", status: "in_progress" },
      { type: "tool_call_update", status: "completed" },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file fails without touching the file when old_string is not found", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "code.ts");
    const original = "function add(a, b) {\n  return a + b;\n}\n";
    writeFileSync(path, original, "utf8");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "return a - b;", new_string: "x" })
    );
    assert.match(result.content, /not found/);
    assert.match(result.content, /re-read/i);
    assert.equal(readFileSync(path, "utf8"), original, "file untouched");
    assert.equal(lastUpdate(conn).status, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file fails on multiple matches unless replace_all is set", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "dup.txt");
    const original = "same\nsame\n";
    writeFileSync(path, original, "utf8");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "same", new_string: "different" })
    );
    assert.match(result.content, /2 matches/);
    assert.equal(readFileSync(path, "utf8"), original, "file untouched");
    assert.equal(lastUpdate(conn).status, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file replace_all replaces every occurrence", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "dup.txt");
    writeFileSync(path, "same\nsame\n", "utf8");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({
        path,
        old_string: "same",
        new_string: "different",
        replace_all: true,
      })
    );
    assert.equal(readFileSync(path, "utf8"), "different\ndifferent\n");
    assert.match(result.content, /2 occurrence/);
    assert.equal(lastUpdate(conn).status, "completed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file with empty new_string removes the matched text", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "keep()\n// remove me\nkeep()\n", "utf8");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "// remove me\n", new_string: "" })
    );
    assert.equal(readFileSync(path, "utf8"), "keep()\nkeep()\n");
    assert.equal(lastUpdate(conn).status, "completed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file rejects missing path, old_string, or new_string", async () => {
  const conn = createConnectionStub();
  const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS);

  const cases = [
    { old_string: "a", new_string: "b" }, // no path
    { path: "/x.txt", new_string: "b" }, // no old_string
    { path: "/x.txt", old_string: "a" }, // no new_string
  ];
  for (const [i, args] of cases.entries()) {
    const r = await exec.execute(`tc-${i}`, "edit_file", JSON.stringify(args));
    assert.match(r.content, /Error:/);
    const last = lastUpdate(conn);
    assert.equal(last.status, "failed", `case ${i} marks the tool call failed`);
  }
  assert.equal(conn.permissionRequests.length, 0, "no permission prompt for invalid input");
});

test("edit_file fails with a create-with-write_file hint when the file does not exist", async () => {
  const dir = makeTempDir();
  try {
    const conn = createConnectionStub();
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path: join(dir, "missing.txt"), old_string: "a", new_string: "b" })
    );
    assert.match(result.content, /does not exist/);
    assert.match(result.content, /write_file/);
    assert.equal(lastUpdate(conn).status, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file rejected by user marks the call failed and skips the edit", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "code.ts");
    const original = "a\n";
    writeFileSync(path, original, "utf8");
    const conn = createConnectionStub({ permission: "reject" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "a", new_string: "b" })
    );
    assert.match(result.content, /rejected by user/i);
    assert.equal(readFileSync(path, "utf8"), original);
    assert.equal(lastUpdate(conn).status, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file cancelled by user marks the call failed and skips the edit", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "code.ts");
    const original = "a\n";
    writeFileSync(path, original, "utf8");
    const conn = createConnectionStub({ permission: "cancelled" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "a", new_string: "b" })
    );
    assert.match(result.content, /cancelled by user/i);
    assert.equal(readFileSync(path, "utf8"), original);
    assert.equal(lastUpdate(conn).status, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file converts requestPermission transport errors into a failed result", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "a\n", "utf8");
    const conn = createConnectionStub({ permissionError: "connection lost" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "a", new_string: "b" })
    );
    assert.match(result.content, /requesting permission.*connection lost/i);
    assert.equal(lastUpdate(conn).status, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file routes read and write through the client fs capability when advertised", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "let x = 1;\n", "utf8");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "let x = 1;", new_string: "let x = 2;" })
    );
    assert.deepEqual(conn.clientReads, [path, path], "read before and after the prompt");
    assert.deepEqual(conn.clientWrites, [{ path, content: "let x = 2;\n" }]);
    assert.equal(readFileSync(path, "utf8"), "let x = 2;\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file uses local disk when the client advertises no fs capability", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "let x = 1;\n", "utf8");
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", NO_FS_CAPS, undefined, null, null, dir);

    await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "let x = 1;", new_string: "let x = 2;" })
    );
    assert.deepEqual(conn.clientReads, []);
    assert.deepEqual(conn.clientWrites, []);
    assert.equal(readFileSync(path, "utf8"), "let x = 2;\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file refuses the edit when the file changes while permission is pending", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "let x = 1;\n", "utf8");
    const changed = "let y = 9;\n";
    const conn = createConnectionStub({
      permission: "allow",
      onPermission: () => writeFileSync(path, changed, "utf8"),
    });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "let x = 1;", new_string: "let x = 2;" })
    );
    assert.match(result.content, /changed while waiting for permission/);
    assert.match(result.content, /no longer present/);
    assert.equal(readFileSync(path, "utf8"), changed, "concurrent change not clobbered");
    assert.deepEqual(conn.clientWrites, [], "no write attempted");
    assert.equal(lastUpdate(conn).status, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file refuses when the match becomes ambiguous while permission is pending", async () => {
  const dir = makeTempDir();
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "same\n", "utf8");
    const changed = "same\nsame\n";
    const conn = createConnectionStub({
      permission: "allow",
      onPermission: () => writeFileSync(path, changed, "utf8"),
    });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "same", new_string: "other" })
    );
    assert.match(result.content, /changed while waiting for permission/);
    assert.match(result.content, /now occurs 2 times/);
    assert.equal(readFileSync(path, "utf8"), changed, "concurrent change not clobbered");
    assert.equal(lastUpdate(conn).status, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edit_file fails when the file exists but cannot be read", async () => {
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  if (isRoot) return; // chmod-based read failure does not apply to root
  const dir = makeTempDir();
  try {
    const path = join(dir, "locked.txt");
    writeFileSync(path, "secret\n", "utf8");
    chmodSync(path, 0o000);
    const conn = createConnectionStub({ permission: "allow" });
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "edit_file",
      JSON.stringify({ path, old_string: "secret", new_string: "x" })
    );
    assert.match(result.content, /Error/);
    assert.equal(lastUpdate(conn).status, "failed");
  } finally {
    chmodSync(join(dir, "locked.txt"), 0o644);
    rmSync(dir, { recursive: true, force: true });
  }
});
