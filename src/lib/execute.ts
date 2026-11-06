import fs from "node:fs";
import path from "node:path";
import { clonePublicRepo } from "./clone";
import { commandTimeoutMs, dataDir, keepWorkspace, maxLogBytes } from "./config";
import { getRun, saveRun } from "./db";
import { detectLocks, loadDocs } from "./docs";
import { planCommands } from "./parser";
import { chooseSandbox, runSandbox } from "./sandbox";
import { suggestFix } from "./suggest";
import type { CommandPlan, CommandSegment, RunRecord, StepResult } from "./types";

const terminal = new Set(["passed", "failed", "error"]);

export async function executeRun(id: string): Promise<void> {
  const existing = getRun(id);
  if (!existing || terminal.has(existing.status)) return;

  const run: RunRecord = {
    ...existing,
    status: "running",
    startedAt: new Date().toISOString(),
    error: null,
  };
  saveRun(run);

  const workspace = path.join(dataDir(), "workspaces", id);
  const repoDir = path.join(workspace, "repo");
  const runtimeDir = path.join(workspace, "runtime");

  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    const cloned = await clonePublicRepo(run.cloneUrl, repoDir);
    run.steps.push(cloned.step);
    saveRun(run);
    if (!cloned.ok) {
      run.suggestedFix =
        "RunReady only clones public https://github.com and https://gitlab.com repositories. Confirm the project is public and that git can reach it without credentials.";
      finish(run, "failed");
      return;
    }

    const loaded = loadDocs(repoDir);
    run.files = loaded.files.map((file) => file.path);
    run.notes = loaded.notes;
    run.docs = loaded.files.map((file) => ({
      path: file.path,
      content: file.content.slice(0, 80_000),
    }));
    run.sandbox = await chooseSandbox();
    const planned = planCommands(loaded.files, detectLocks(repoDir));
    saveRun(run);

    const skippedSteps = planned.skipped.map((skip) => ({
      phase: "verify" as const,
      command: skip.command,
      sourceFile: skip.file,
      sourceLine: skip.line,
      derived: false,
      network: "off" as const,
      status: "skipped" as const,
      exitCode: null,
      durationMs: 0,
      log: skip.reason,
      truncated: false,
      skipReason: skip.reason,
    }));

    if (planned.plans.length === 0 && skippedSteps.length === 0) {
      run.suggestedFix =
        "No install, build, or verify commands were found in AGENTS.md, CLAUDE.md, install.md, or the README install and development sections. Add the exact commands a clean machine should run.";
      finish(run, "failed");
      return;
    }

    let failed = false;
    for (const plan of planned.plans) {
      if (failed) {
        run.steps.push(notRun(plan));
        continue;
      }
      const result = await runPlan(run, plan, repoDir, runtimeDir);
      run.steps.push(result);
      saveRun(run);
      if (result.status === "failed") {
        failed = true;
        run.suggestedFix = suggestFix(result);
      }
    }

    run.steps.push(...skippedSteps);
    if (!failed && planned.plans.length === 0) {
      run.suggestedFix =
        "Every documented command was refused by the safety check. Remove pipes, absolute paths, and secret environment variables from the install docs.";
      finish(run, "failed");
      return;
    }
    finish(run, failed ? "failed" : "passed");
  } catch (error) {
    run.error = error instanceof Error ? error.message : "The run failed before it could finish.";
    finish(run, "error");
  } finally {
    if (!keepWorkspace()) fs.rmSync(workspace, { recursive: true, force: true });
  }
}

async function runPlan(
  run: RunRecord,
  plan: CommandPlan,
  repoDir: string,
  runtimeDir: string,
): Promise<StepResult> {
  const started = Date.now();
  let log = "";
  let truncated = false;
  let exitCode: number | null = 0;
  let timedOut = false;

  for (const segment of plan.segments) {
    const result = await runSandbox(run.sandbox || "unshare", {
      workdir: repoDir,
      runtimeDir,
      cwd: segment.cwd,
      network: plan.network,
      timeoutMs: commandTimeoutMs(),
      maxLogBytes: maxLogBytes(),
      argv: withEnv(segment),
    });
    log = joinLog(log, result.log);
    truncated = truncated || result.truncated;
    exitCode = result.exitCode;
    timedOut = timedOut || result.timedOut;
    if (exitCode !== 0) break;
  }

  return {
    phase: plan.phase,
    command: plan.command,
    sourceFile: plan.sourceFile,
    sourceLine: plan.sourceLine,
    derived: plan.derived,
    network: plan.network,
    status: exitCode === 0 ? "passed" : "failed",
    exitCode,
    durationMs: Date.now() - started,
    log,
    truncated,
    timedOut,
  };
}

function withEnv(segment: CommandSegment): string[] {
  const prefix = Object.entries(segment.env).map(([key, value]) => `${key}=${value}`);
  if (prefix.length === 0) return segment.argv;
  return ["env", ...prefix, ...segment.argv];
}

function notRun(plan: CommandPlan): StepResult {
  return {
    phase: plan.phase,
    command: plan.command,
    sourceFile: plan.sourceFile,
    sourceLine: plan.sourceLine,
    derived: plan.derived,
    network: plan.network,
    status: "skipped",
    exitCode: null,
    durationMs: 0,
    log: "Not run because an earlier command failed.",
    truncated: false,
    skipReason: "Not run because an earlier command failed.",
  };
}

function finish(run: RunRecord, status: "passed" | "failed" | "error"): void {
  run.status = status;
  run.finishedAt = new Date().toISOString();
  run.durationMs = run.startedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : null;
  saveRun(run);
}

function joinLog(current: string, next: string): string {
  if (!current) return next;
  if (!next) return current;
  return `${current}\n${next}`;
}
