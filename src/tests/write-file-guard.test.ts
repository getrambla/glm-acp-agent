import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolExecutor } from "../tools/executor.js";

// Tests for write_file's overwrite guard: rewriting an existing file needs an
// explicit overwrite: true; passing overwrite in any form for a file that does
// NOT exist also fails (bad-habit guard against reflexive escape-hatch use).

interface StubOptions {
  permission?: "allow" | "reject";
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
      if (opts.permission === "reject") {
        return { outcome: { outcome: "selected", optionId: "reject" } };
      }
      return { outcome: { outcome: "selected", optionId: "allow" } };
    },
  };
}

const FULL_CAPS = { fs: { readTextFile: true, writeTextFile: true }, terminal: true };

function updatesOf(conn: ReturnType<typeof createConnectionStub>): Array<{
  status?: string;
  rawOutput?: Record<string, unknown>;
  content?: Array<Record<string, unknown>>;
}> {
  return conn.updates.map((u) => u.update as Record<string, unknown>);
}

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), "glm-write-guard-"));
}

test("existing file without overwrite: true fails and mentions edit_file", async () => {
  const dir = makeDir();
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "original\n", "utf8");
    const conn = createConnectionStub();
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "write_file",
      JSON.stringify({ path, content: "rewritten\n" })
    );
    assert.match(result.content, /refusing to overwrite/);
    assert.match(result.content, /edit_file/);
    assert.match(result.content, /overwrite: true/);
    assert.equal(readFileSync(path, "utf8"), "original\n", "file untouched");
    assert.equal(updatesOf(conn).at(-1)?.status, "failed");
    assert.equal(conn.permissionRequests.length, 0, "no prompt for a guarded call");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("existing file with overwrite: true proceeds and emits the diff", async () => {
  const dir = makeDir();
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "original\n", "utf8");
    const conn = createConnectionStub();
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "write_file",
      JSON.stringify({ path, content: "rewritten\n", overwrite: true })
    );
    assert.match(result.content, /written successfully/);
    assert.equal(readFileSync(path, "utf8"), "rewritten\n");
    const completed = updatesOf(conn).at(-1);
    assert.equal(completed?.status, "completed");
    assert.ok(completed?.content?.some((c) => c.type === "diff"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("existing file with overwrite: false fails (only true unlocks)", async () => {
  const dir = makeDir();
  try {
    const path = join(dir, "code.ts");
    writeFileSync(path, "original\n", "utf8");
    const conn = createConnectionStub();
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "write_file",
      JSON.stringify({ path, content: "rewritten\n", overwrite: false })
    );
    assert.match(result.content, /refusing to overwrite/);
    assert.equal(readFileSync(path, "utf8"), "original\n");
    assert.equal(updatesOf(conn).at(-1)?.status, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("new file with overwrite: true fails with the bad-habit message", async () => {
  const dir = makeDir();
  try {
    const path = join(dir, "new.txt");
    const conn = createConnectionStub();
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "write_file",
      JSON.stringify({ path, content: "data\n", overwrite: true })
    );
    assert.match(result.content, /bad move/i);
    assert.match(result.content, /overwrite/);
    assert.match(result.content, /does not exist/i);
    assert.equal(existsSync(path), false, "no file was created");
    assert.equal(updatesOf(conn).at(-1)?.status, "failed");
    assert.equal(conn.permissionRequests.length, 0, "no prompt for a guarded call");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("new file with overwrite: false fails like overwrite: true does", async () => {
  const dir = makeDir();
  try {
    const path = join(dir, "new.txt");
    const conn = createConnectionStub();
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "write_file",
      JSON.stringify({ path, content: "data\n", overwrite: false })
    );
    assert.match(result.content, /bad move/i);
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("new file without overwrite succeeds", async () => {
  const dir = makeDir();
  try {
    const path = join(dir, "new.txt");
    const conn = createConnectionStub();
    const exec = new ToolExecutor(conn as never, "s1", FULL_CAPS, undefined, null, null, dir);

    const result = await exec.execute(
      "tc1",
      "write_file",
      JSON.stringify({ path, content: "data\n" })
    );
    assert.match(result.content, /written successfully/);
    assert.equal(readFileSync(path, "utf8"), "data\n");
    assert.equal(updatesOf(conn).at(-1)?.status, "completed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
