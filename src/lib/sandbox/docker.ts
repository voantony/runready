import os from "node:os";
import { dockerImage } from "../config";
import { captureProcess, type ProcessResult } from "../process";

export type SandboxRequest = {
  workdir: string;
  runtimeDir: string;
  cwd: string;
  network: "on" | "off";
  timeoutMs: number;
  maxLogBytes: number;
  argv: string[];
};

export function dockerRunArgs(options: {
  name: string;
  workdir: string;
  cwd: string;
  network: "on" | "off";
  timeoutSec: number;
  image: string;
  uid: number;
  gid: number;
  argv: string[];
}): string[] {
  const work = options.cwd && options.cwd !== "." ? `/work/${options.cwd}` : "/work";
  return [
    "run",
    "--rm",
    "--name",
    options.name,
    "--network",
    options.network === "on" ? "bridge" : "none",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "256",
    "--memory",
    "1536m",
    "--cpus",
    "1.5",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,exec,nosuid,nodev,mode=1777",
    "--tmpfs",
    "/home:rw,nosuid,nodev,mode=755",
    "--tmpfs",
    "/root:rw,nosuid,nodev,mode=755",
    "-v",
    `${options.workdir}:/work`,
    "-w",
    work,
    "-e",
    "HOME=/tmp",
    "-e",
    "TMPDIR=/tmp",
    "-e",
    "CI=1",
    "-e",
    "NPM_CONFIG_UPDATE_NOTIFIER=false",
    "-e",
    "npm_config_fund=false",
    "-e",
    "npm_config_cache=/tmp/npm-cache",
    "--user",
    `${options.uid}:${options.gid}`,
    options.image,
    "timeout",
    "--foreground",
    "-k",
    "5s",
    String(options.timeoutSec),
    ...options.argv,
  ];
}

export async function runDocker(request: SandboxRequest): Promise<ProcessResult> {
  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  const gid = typeof process.getgid === "function" ? process.getgid() : 1000;
  const args = dockerRunArgs({
    name: `runready-${crypto.randomUUID()}`,
    workdir: request.workdir,
    cwd: request.cwd,
    network: request.network,
    timeoutSec: Math.max(1, Math.ceil(request.timeoutMs / 1000)),
    image: dockerImage(),
    uid,
    gid,
    argv: request.argv,
  });
  const env: Record<string, string> = {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: os.homedir(),
  };
  if (process.env.DOCKER_HOST) env.DOCKER_HOST = process.env.DOCKER_HOST;
  const result = await captureProcess({
    command: "docker",
    args,
    env,
    timeoutMs: request.timeoutMs + 20_000,
    maxLogBytes: request.maxLogBytes,
  });
  if (result.exitCode === 124) result.timedOut = true;
  return result;
}
