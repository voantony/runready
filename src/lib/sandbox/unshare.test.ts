import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { runUnshare } from "./unshare";

test("unshare runs node, hides host secrets, and blocks the network", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runready-sbx-"));
  const workdir = path.join(root, "repo");
  const runtimeDir = path.join(root, "runtime");
  fs.mkdirSync(workdir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  const previous = process.env.RUNREADY_HOST_PROBE;
  process.env.RUNREADY_HOST_PROBE = "host-only-probe-value";

  const ran = await runUnshare({
    workdir,
    runtimeDir,
    cwd: ".",
    network: "on",
    timeoutMs: 20_000,
    maxLogBytes: 20_000,
    argv: [
      "node",
      "-e",
      "process.stdout.write((process.env.RUNREADY_HOST_PROBE || 'nosecret') + ':' + (require('fs').existsSync('/home/ubuntu') ? 'leak' : 'hidden'))",
    ],
  });
  assert.equal(ran.exitCode, 0, ran.log);
  assert.match(ran.log, /nosecret:hidden/);

  const offline = await runUnshare({
    workdir,
    runtimeDir,
    cwd: ".",
    network: "off",
    timeoutMs: 20_000,
    maxLogBytes: 20_000,
    argv: [
      "node",
      "-e",
      "fetch('https://example.com').then(() => process.exit(0)).catch(() => process.exit(7))",
    ],
  });
  assert.equal(offline.exitCode, 7, offline.log);

  if (previous === undefined) delete process.env.RUNREADY_HOST_PROBE;
  else process.env.RUNREADY_HOST_PROBE = previous;
  fs.rmSync(root, { recursive: true, force: true });
});
