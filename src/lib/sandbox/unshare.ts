import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "../config";
import { captureProcess, type ProcessResult } from "../process";
import type { SandboxRequest } from "./docker";

export async function runUnshare(request: SandboxRequest): Promise<ProcessResult> {
  const script = path.join(projectRoot(), "src/sandbox/enter.sh");
  const timeoutSec = Math.max(1, Math.ceil(request.timeoutMs / 1000));
  const args = [
    "--user",
    "--map-root-user",
    "--mount",
    "--pid",
    "--fork",
    "--mount-proc",
    ...(request.network === "off" ? ["--net"] : []),
    "--",
    script,
    request.workdir,
    request.runtimeDir,
    detectNodePrefix(),
    String(timeoutSec),
    request.cwd || ".",
    "--",
    ...request.argv,
  ];
  const result = await captureProcess({
    command: "unshare",
    args,
    env: {
      PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
    },
    timeoutMs: request.timeoutMs + 15_000,
    maxLogBytes: request.maxLogBytes,
  });
  if (result.exitCode === 124) result.timedOut = true;
  return result;
}

export function detectNodePrefix(): string {
  const bins: string[] = [];
  for (const bin of ["npm", "node"]) {
    try {
      const found = execFileSync("which", [bin], {
        encoding: "utf8",
        env: process.env,
      }).trim();
      if (found) bins.push(found);
    } catch {
      // which exits non-zero when the tool is absent.
    }
  }
  bins.push(process.execPath);

  for (const bin of bins) {
    const prefix = prefixFromBin(bin);
    if (prefix) return prefix;
  }
  return "";
}

function prefixFromBin(binPath: string): string | null {
  // npm is often a symlink into lib/node_modules. Keep the bin directory
  // instead of realpath'ing through that link.
  const prefix = path.dirname(path.dirname(binPath));
  if (
    fs.existsSync(path.join(prefix, "bin", "node")) &&
    fs.existsSync(path.join(prefix, "bin", "npm"))
  ) {
    return prefix;
  }
  return null;
}
