import { unifiedDiff } from "./diff";
import type { RunRecord } from "./types";

export type FixKind = "failed" | "incomplete";

export type FixFile = {
  path: string;
  content: string;
  mode: "100644" | "100755";
  existed: boolean;
};

export type FixProposal = {
  offer: true;
  kind: FixKind;
  reasons: string[];
  branch: string;
  title: string;
  body: string;
  files: FixFile[];
  patch: string;
  instructions: string;
  canOpen: boolean;
  openBlocker: string | null;
};

const MARKER = "## RunReady clean-machine commands";

export function assessRun(run: RunRecord): { offer: boolean; kind: FixKind | null; reasons: string[] } {
  if (run.status === "queued" || run.status === "running") return { offer: false, kind: null, reasons: [] };
  const cloneFailed = run.steps.some((step) => step.phase === "clone" && step.status === "failed");
  if (cloneFailed) return { offer: false, kind: null, reasons: [] };

  const reasons: string[] = [];
  if (run.status === "failed" || run.status === "error") reasons.push("The proof did not pass.");
  if (run.notes.some((note) => /fell back|linked contributing|No AGENTS/i.test(note))) {
    reasons.push("The install, build, or verify commands were not in AGENTS.md, CLAUDE.md, or install.md.");
  }
  if (!run.files.includes("AGENTS.md") && !run.files.includes("CLAUDE.md") && !run.files.some((file) => /install\.md$/i.test(file))) {
    reasons.push("The repository has no AGENTS.md, CLAUDE.md, or install.md.");
  }
  if (run.steps.some((step) => step.derived)) {
    reasons.push("An install command was derived because the docs did not list one.");
  }
  if (run.steps.some((step) => step.status === "skipped" && step.phase !== "clone")) {
    reasons.push("A documented command was skipped by the safety check.");
  }

  const commandSteps = run.steps.filter((step) => step.phase !== "clone");
  if (run.status === "passed" && reasons.length === 0) return { offer: false, kind: null, reasons: [] };
  if (run.status === "passed") return { offer: true, kind: "incomplete", reasons };
  if (commandSteps.length === 0 && run.status !== "failed") return { offer: false, kind: null, reasons };
  return { offer: true, kind: "failed", reasons };
}

export function verifiedCommands(run: RunRecord): string[] {
  const seen = new Set<string>();
  const commands: string[] = [];
  for (const step of run.steps) {
    if (step.phase === "clone" || step.status !== "passed") continue;
    if (seen.has(step.command)) continue;
    seen.add(step.command);
    commands.push(step.command);
  }
  return commands;
}

export function buildFixProposal(run: RunRecord): FixProposal | null {
  const assessment = assessRun(run);
  if (!assessment.offer || !assessment.kind) return null;

  const commands = verifiedCommands(run);
  const docPath = targetDoc(run);
  const previous = snapshot(run, docPath);
  const existed = previous !== null || run.files.includes(docPath);
  const doc = mergeAgentDoc(previous, agentSection(run, commands));
  const script = agentCheckScript(run, commands);
  const workflow = run.host === "gitlab" ? gitlabCi(commands) : githubWorkflow(commands);
  const workflowPath = run.host === "gitlab" ? ".gitlab-ci.yml" : ".github/workflows/runready.yml";

  const files: FixFile[] = [
    { path: docPath, content: ensureTrailingNewline(doc), mode: "100644", existed: existed && previous !== null },
    { path: "scripts/agent-check", content: ensureTrailingNewline(script), mode: "100755", existed: false },
    { path: workflowPath, content: ensureTrailingNewline(workflow), mode: "100644", existed: false },
  ];

  const patch = files
    .map((file) => unifiedDiff(file.path, file.existed ? previous : null, file.content, file.mode))
    .filter(Boolean)
    .join("");

  const branch = `runready/agent-check-${run.id.slice(0, 8)}`;
  const title = assessment.kind === "failed"
    ? "docs: record the clean-machine commands that failed"
    : "docs: record clean-machine install commands in AGENTS";
  const body = pullRequestBody(run, assessment.reasons, commands, docPath);
  const missingSnapshot = run.files.includes(docPath) && previous === null;
  const instructions = pushInstructions(run, branch, docPath, missingSnapshot);

  return {
    offer: true,
    kind: assessment.kind,
    reasons: assessment.reasons,
    branch,
    title,
    body,
    files,
    patch,
    instructions,
    canOpen: !missingSnapshot,
    openBlocker: missingSnapshot
      ? `${docPath} existed, but this run did not keep a copy of it. Download the patch and merge that section by hand so the open-PR path does not overwrite the file.`
      : null,
  };
}

function targetDoc(run: RunRecord): string {
  if (run.files.includes("AGENTS.md") || !run.files.includes("CLAUDE.md")) {
    if (run.files.includes("AGENTS.md") || run.files.includes("CLAUDE.md") || run.files.some((file) => /install\.md$/i.test(file))) {
      if (run.files.includes("AGENTS.md")) return "AGENTS.md";
    }
  }
  if (run.files.includes("CLAUDE.md") && !run.files.includes("AGENTS.md")) return "CLAUDE.md";
  const install = run.files.find((file) => /(?:^|\/)install\.md$/i.test(file));
  if (install && !run.files.includes("AGENTS.md") && !run.files.includes("CLAUDE.md")) return install;
  return "AGENTS.md";
}

function snapshot(run: RunRecord, path: string): string | null {
  const doc = run.docs?.find((item) => item.path === path);
  return doc ? doc.content : null;
}

export function mergeAgentDoc(before: string | null, section: string): string {
  const block = section.trim().endsWith("\n") ? section.trim() : `${section.trim()}\n`;
  if (!before || !before.trim()) return `${block.replace(/\n+$/, "")}\n`;
  const source = before.replace(/\r\n/g, "\n");
  if (source.includes(MARKER)) {
    const replaced = source.replace(new RegExp(`${MARKER}[\\s\\S]*?(?=\\n## |$)`), `${block.trimEnd()}\n`);
    return `${replaced.replace(/\n+$/, "")}\n`;
  }
  return `${source.replace(/\n+$/, "")}\n\n${block.replace(/\n+$/, "")}\n`;
}

function agentSection(run: RunRecord, commands: string[]): string {
  const fence = commands.length
    ? ["```sh", ...commands, "```"].join("\n")
    : "```sh\n# No command passed. Fill these in, then re-run the proof.\n# npm ci\n# npm test\n```";
  const failed = run.steps.filter((step) => step.phase !== "clone" && step.status === "failed");
  const lines = [
    MARKER,
    "",
    `Verified by RunReady proof \`${run.id}\` against ${run.webUrl}.`,
    "",
    "`bash scripts/agent-check` runs the commands that passed on a clean checkout.",
    "",
    fence,
  ];
  if (failed.length || run.suggestedFix) {
    lines.push("", "Commands that did not pass are omitted from the script:");
    for (const step of failed) {
      lines.push(`- \`${step.command}\` exited ${step.exitCode ?? "with no code"}`);
    }
    if (run.suggestedFix) lines.push("", run.suggestedFix);
  }
  return lines.join("\n");
}

function agentCheckScript(run: RunRecord, commands: string[]): string {
  const lines = [
    "#!/bin/sh",
    "# Re-run the commands RunReady verified on a clean checkout.",
    `# Proof: ${run.id}`,
    "set -eu",
    'cd "$(dirname "$0")/.."',
  ];
  if (commands.length === 0) {
    lines.push("echo \"RunReady found no verified install, build, or verify command.\" >&2");
    lines.push("exit 1");
    return lines.join("\n");
  }
  for (const command of commands) {
    lines.push(`sh -c ${shellQuote(command)}`);
  }
  return lines.join("\n");
}

function githubWorkflow(commands: string[]): string {
  const steps = ["      - uses: actions/checkout@v4"];
  if (commands.some((command) => /^(npm|npx|pnpm|yarn|bun|node|corepack|tsc)\b/.test(command))) {
    steps.push(
      "      - uses: actions/setup-node@v4",
      "        with:",
      '          node-version: "22"',
    );
  }
  if (commands.some((command) => /^(luajit|lua|lua5\.1)\b/.test(command))) {
    steps.push("      - name: Install LuaJIT", "        run: sudo apt-get update && sudo apt-get install -y luajit make");
  }
  steps.push("      - name: Agent check", "        run: bash scripts/agent-check");
  return [
    "name: RunReady",
    "on:",
    "  pull_request:",
    "  push:",
    "    branches: [main, master]",
    "jobs:",
    "  agent-check:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    ...steps,
    "",
  ].join("\n");
}

function gitlabCi(commands: string[]): string {
  const lines = ["runready:", commands.some((command) => /^(luajit|lua)\b/.test(command))
    ? "  image: debian:bookworm-slim"
    : "  image: node:22-bookworm", "  script:"];
  if (commands.some((command) => /^(luajit|lua)\b/.test(command))) {
    lines.push("    - apt-get update && apt-get install -y --no-install-recommends luajit make ca-certificates");
  }
  lines.push("    - bash scripts/agent-check");
  return `${lines.join("\n")}\n`;
}

function pullRequestBody(run: RunRecord, reasons: string[], commands: string[], docPath: string): string {
  const lines = [
    "RunReady drafted this change from a clean-machine proof.",
    "",
    `Proof: \`${run.id}\``,
    `Repository: ${run.webUrl}`,
    "",
    "Why:",
    ...reasons.map((reason) => `- ${reason}`),
    "",
    `Verified commands written to \`${docPath}\` and \`scripts/agent-check\`:`,
  ];
  if (commands.length === 0) lines.push("- None passed. The script exits 1 until real commands are added.");
  else for (const command of commands) lines.push(`- \`${command}\``);
  if (run.suggestedFix) lines.push("", "Suggested fix from the failing log:", "", run.suggestedFix);
  lines.push("", "The workflow runs `bash scripts/agent-check` on pull requests.");
  return lines.join("\n");
}

function pushInstructions(run: RunRecord, branch: string, docPath: string, missingSnapshot: boolean): string {
  const remote = run.host === "gitlab" ? "GitLab" : "GitHub";
  const extra = missingSnapshot
    ? `\n${docPath} already exists and this proof did not store the original. Apply the new section by hand, or replace the file only after comparing it.\n`
    : "";
  return `Branch: ${branch}
${extra}
1. Download the patch from this report.
2. In a clone of ${run.webUrl}:
   git checkout -b ${branch}
   git apply runready.patch
   git add ${docPath} scripts/agent-check ${run.host === "gitlab" ? ".gitlab-ci.yml" : ".github/workflows/runready.yml"}
   git commit -m "docs: add RunReady clean-machine check"
   git push -u origin HEAD
3. Open a ${remote === "GitLab" ? "merge request" : "pull request"} using the title and body in this report.

To let RunReady open it, set ${run.host === "gitlab" ? "GITLAB_TOKEN" : "GITHUB_TOKEN"} and use Open pull request. The token is read on the server and is not stored. If it cannot push to the upstream repo, RunReady forks the project and opens the request from the fork.`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
