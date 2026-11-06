import { spawn } from "node:child_process";

export type ProcessResult = {
  exitCode: number | null;
  log: string;
  timedOut: boolean;
  truncated: boolean;
};

export async function captureProcess(options: {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs: number;
  maxLogBytes: number;
  discardLog?: boolean;
}): Promise<ProcessResult> {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env as NodeJS.ProcessEnv | undefined,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  let truncated = false;
  let timedOut = false;
  let exitCode: number | null = null;
  let settled = false;

  return new Promise((resolve) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve({ exitCode, log: log.trim(), timedOut, truncated });
    };

    const push = (chunk: Buffer) => {
      if (options.discardLog) return;
      log += stripAnsi(chunk.toString("utf8"));
      if (log.length > options.maxLogBytes) {
        truncated = true;
        log = `[earlier output truncated]\n${log.slice(log.length - options.maxLogBytes)}`;
      }
    };

    child.stdout?.on("data", push);
    child.stderr?.on("data", push);
    child.on("error", (error) => {
      log += `${error.message}\n`;
      exitCode = 127;
      finish();
    });
    child.on("close", (code) => {
      if (exitCode === null) exitCode = timedOut ? 124 : code;
      finish();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.on("close", () => clearTimeout(timer));
  });
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}
