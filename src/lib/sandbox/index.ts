import { sandboxPreference } from "../config";
import { captureProcess, type ProcessResult } from "../process";
import { runDocker, type SandboxRequest } from "./docker";
import { runUnshare } from "./unshare";
import type { SandboxKind } from "../types";

export type { SandboxRequest };

export async function chooseSandbox(): Promise<SandboxKind> {
  const preference = sandboxPreference();
  if (preference === "unshare") return "unshare";
  if (preference === "docker") return "docker";
  return (await dockerAvailable()) ? "docker" : "unshare";
}

export async function runSandbox(
  kind: SandboxKind,
  request: SandboxRequest,
): Promise<ProcessResult> {
  if (kind === "docker") return runDocker(request);
  return runUnshare(request);
}

async function dockerAvailable(): Promise<boolean> {
  const result = await captureProcess({
    command: "docker",
    args: ["info"],
    timeoutMs: 4_000,
    maxLogBytes: 1_000_000,
    discardLog: true,
    env: { PATH: process.env.PATH || "/usr/bin:/bin" },
  });
  return result.exitCode === 0;
}
