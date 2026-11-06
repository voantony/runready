export type Host = "github" | "gitlab";

export type RunStatus = "queued" | "running" | "passed" | "failed" | "error";

export type Phase = "clone" | "install" | "build" | "verify";

export type SandboxKind = "docker" | "unshare";

export type RepoRef = {
  host: Host;
  owner: string;
  project: string;
  webUrl: string;
  cloneUrl: string;
};

export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export type StepResult = {
  phase: Phase;
  command: string;
  sourceFile: string | null;
  sourceLine: number | null;
  derived: boolean;
  network: "on" | "off";
  status: StepStatus;
  exitCode: number | null;
  durationMs: number | null;
  log: string;
  truncated: boolean;
  skipReason?: string;
  timedOut?: boolean;
};

export type RunRecord = {
  id: string;
  repoUrl: string;
  webUrl: string;
  cloneUrl: string;
  host: Host;
  owner: string;
  project: string;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  sandbox: SandboxKind | null;
  files: string[];
  notes: string[];
  steps: StepResult[];
  suggestedFix: string | null;
  error: string | null;
  /** Doc files read during the run, so a fix request can patch them. */
  docs?: DocSnapshot[];
};

export type DocSnapshot = {
  path: string;
  content: string;
};

export type CommandPlan = {
  phase: Exclude<Phase, "clone">;
  command: string;
  segments: CommandSegment[];
  sourceFile: string;
  sourceLine: number;
  derived: boolean;
  network: "on" | "off";
};

export type CommandSegment = {
  argv: string[];
  env: Record<string, string>;
  cwd: string;
};
