import fs from "node:fs";
import { cloneTimeoutMs, maxLogBytes } from "./config";
import { captureProcess } from "./process";
import type { StepResult } from "./types";

export async function clonePublicRepo(
  cloneUrl: string,
  dest: string,
): Promise<{ ok: boolean; step: StepResult }> {
  if (!/^https:\/\/(github|gitlab)\.com\/.+\.git$/.test(cloneUrl)) {
    return {
      ok: false,
      step: failedClone(cloneUrl, "Refusing to clone a URL outside github.com and gitlab.com."),
    };
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const parent = dest.replace(/\/[^/]+$/, "") || ".";
  const started = Date.now();
  const result = await captureProcess({
    command: "git",
    args: [
      "-c",
      "safe.directory=*",
      "-c",
      "protocol.file.allow=never",
      "-c",
      "credential.helper=",
      "clone",
      "--depth",
      "1",
      "--single-branch",
      "--no-tags",
      "--",
      cloneUrl,
      dest,
    ],
    cwd: parent,
    env: {
      PATH: process.env.PATH || "/usr/bin:/bin",
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_ASKPASS: "true",
    },
    timeoutMs: cloneTimeoutMs(),
    maxLogBytes: Math.min(maxLogBytes(), 100_000),
  });

  const ok = result.exitCode === 0;
  return {
    ok,
    step: {
      phase: "clone",
      command: `git clone --depth 1 ${cloneUrl}`,
      sourceFile: null,
      sourceLine: null,
      derived: false,
      network: "on",
      status: ok ? "passed" : "failed",
      exitCode: result.exitCode,
      durationMs: Date.now() - started,
      log: result.log || (ok ? "Cloned." : "git clone failed."),
      truncated: result.truncated,
      timedOut: result.timedOut,
    },
  };
}

function failedClone(cloneUrl: string, log: string): StepResult {
  return {
    phase: "clone",
    command: `git clone --depth 1 ${cloneUrl}`,
    sourceFile: null,
    sourceLine: null,
    derived: false,
    network: "on",
    status: "failed",
    exitCode: 2,
    durationMs: 0,
    log,
    truncated: false,
  };
}
