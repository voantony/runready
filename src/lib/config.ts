import path from "node:path";

export function projectRoot(): string {
  return process.env.RUNREADY_ROOT
    ? path.resolve(process.env.RUNREADY_ROOT)
    : process.cwd();
}

export function dataDir(): string {
  return process.env.RUNREADY_DATA_DIR
    ? path.resolve(process.env.RUNREADY_DATA_DIR)
    : path.join(projectRoot(), "data");
}

export function commandTimeoutMs(): number {
  return positiveInt(process.env.RUNREADY_COMMAND_TIMEOUT_MS, 180_000);
}

export function cloneTimeoutMs(): number {
  return positiveInt(process.env.RUNREADY_CLONE_TIMEOUT_MS, 120_000);
}

export function maxLogBytes(): number {
  return positiveInt(process.env.RUNREADY_MAX_LOG_BYTES, 200_000);
}

export function sandboxPreference(): "auto" | "docker" | "unshare" {
  const value = (process.env.RUNREADY_SANDBOX || "auto").toLowerCase();
  if (value === "docker" || value === "unshare") return value;
  return "auto";
}

export function dockerImage(): string {
  return process.env.RUNREADY_DOCKER_IMAGE || "node:22-bookworm";
}

export function keepWorkspace(): boolean {
  return process.env.RUNREADY_KEEP_WORKSPACE === "1";
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
