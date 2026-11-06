import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildFixProposal, verifiedCommands } from "./fixpr";
import type { RunRecord, StepResult } from "./types";

function step(partial: Partial<StepResult> & Pick<StepResult, "phase" | "command" | "status">): StepResult {
  return {
    sourceFile: "AGENTS.md",
    sourceLine: 1,
    derived: false,
    network: partial.phase === "install" ? "on" : "off",
    exitCode: partial.status === "passed" ? 0 : partial.status === "skipped" ? null : 1,
    durationMs: 10,
    log: "",
    truncated: false,
    ...partial,
  };
}

function run(partial: Partial<RunRecord>): RunRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    repoUrl: "https://gitlab.com/antonyvo/koreader-library-gui",
    webUrl: "https://gitlab.com/antonyvo/koreader-library-gui",
    cloneUrl: "https://gitlab.com/antonyvo/koreader-library-gui.git",
    host: "gitlab",
    owner: "antonyvo",
    project: "koreader-library-gui",
    status: "passed",
    createdAt: "2026-11-06T00:00:00.000Z",
    startedAt: "2026-11-06T00:00:00.000Z",
    finishedAt: "2026-11-06T00:00:01.000Z",
    durationMs: 1000,
    sandbox: "unshare",
    files: ["AGENTS.md"],
    notes: [],
    steps: [step({ phase: "clone", command: "git clone", status: "passed", network: "on", sourceFile: null })],
    suggestedFix: null,
    error: null,
    ...partial,
  };
}

test("a complete passing proof does not draft a fix", () => {
  const proposal = buildFixProposal(
    run({
      host: "github",
      files: ["AGENTS.md"],
      docs: [{ path: "AGENTS.md", content: "# AGENTS\n\n## Commands\n\n`npm test`\n" }],
      steps: [
        step({ phase: "clone", command: "git clone", status: "passed", network: "on", sourceFile: null }),
        step({ phase: "install", command: "npm install", status: "passed" }),
        step({ phase: "verify", command: "npm test", status: "passed" }),
      ],
    }),
  );
  assert.equal(proposal, null);
});

test("incomplete gitlab docs produce an applicable patch with only verified commands", () => {
  const record = run({
    notes: ["AGENTS.md, CLAUDE.md, and install.md did not list install, build, or verify commands. RunReady used the README and linked contributing docs."],
    files: ["AGENTS.md", "README.md", "CONTRIBUTING.md"],
    docs: [{ path: "AGENTS.md", content: "# Agent notes\n\n## Screenshots\n\nUse the emulator.\n" }],
    steps: [
      step({ phase: "clone", command: "git clone", status: "passed", network: "on", sourceFile: null }),
      step({ phase: "build", command: "make zip VERSION=0.3.0", status: "passed", sourceFile: "CONTRIBUTING.md" }),
      step({ phase: "verify", command: "luajit spec/run.lua", status: "passed", sourceFile: "CONTRIBUTING.md" }),
      step({
        phase: "verify",
        command: "make test LUA=/path/to/koreader/luajit",
        status: "skipped",
        skipReason: "Refusing argument",
        sourceFile: "CONTRIBUTING.md",
      }),
    ],
  });
  const proposal = buildFixProposal(record);
  assert.ok(proposal);
  assert.equal(proposal.kind, "incomplete");
  assert.deepEqual(verifiedCommands(record), ["make zip VERSION=0.3.0", "luajit spec/run.lua"]);
  const script = proposal.files.find((file) => file.path === "scripts/agent-check");
  assert.ok(script);
  assert.match(script.content, /make zip VERSION=0\.3\.0/);
  assert.match(script.content, /luajit spec\/run\.lua/);
  assert.equal(script.content.includes("LUA=/path"), false);
  assert.ok(proposal.files.some((file) => file.path === ".gitlab-ci.yml"));
  assert.equal(proposal.canOpen, true);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runready-apply-"));
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# Agent notes\n\n## Screenshots\n\nUse the emulator.\n");
  fs.writeFileSync(path.join(dir, "patch.diff"), proposal.patch);
  execFileSync("git", ["apply", "--check", "patch.diff"], { cwd: dir });
  execFileSync("git", ["apply", "patch.diff"], { cwd: dir });
  const updated = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
  assert.match(updated, /Use the emulator/);
  assert.match(updated, /luajit spec\/run\.lua/);
  assert.equal(fs.statSync(path.join(dir, "scripts/agent-check")).mode & 0o111, 0o111);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a failed command stays out of the check script", () => {
  const proposal = buildFixProposal(
    run({
      host: "github",
      status: "failed",
      suggestedFix: "package.json has no script for `npm run missing`.",
      docs: [{ path: "AGENTS.md", content: "# AGENTS\n" }],
      steps: [
        step({ phase: "clone", command: "git clone", status: "passed", network: "on", sourceFile: null }),
        step({ phase: "install", command: "npm ci", status: "passed" }),
        step({ phase: "verify", command: "npm run missing", status: "failed", exitCode: 1 }),
      ],
    }),
  );
  assert.ok(proposal);
  assert.equal(proposal.kind, "failed");
  const script = proposal.files.find((file) => file.path === "scripts/agent-check")?.content ?? "";
  assert.match(script, /npm ci/);
  assert.equal(script.includes("npm run missing"), false);
  assert.match(proposal.body, /npm run missing/);
  assert.ok(proposal.files.some((file) => file.path === ".github/workflows/runready.yml"));
});

test("a clone failure does not produce a patch", () => {
  const proposal = buildFixProposal(
    run({
      status: "failed",
      steps: [step({ phase: "clone", command: "git clone", status: "failed", exitCode: 128, network: "on", sourceFile: null })],
    }),
  );
  assert.equal(proposal, null);
});
