import type { CommandPlan } from "./types";
import { parseCdAndCommand } from "./safety";

export type DocInput = { path: string; content: string };

export type LockHints = {
  packageJson: boolean;
  npmLock: boolean;
  pnpmLock: boolean;
  yarnLock: boolean;
};

export type SkippedCommand = {
  command: string;
  file: string;
  line: number;
  reason: string;
};

const NON_SHELL = new Set([
  "js",
  "javascript",
  "ts",
  "typescript",
  "tsx",
  "jsx",
  "json",
  "yml",
  "yaml",
  "python",
  "py",
  "lua",
  "rb",
  "ruby",
  "go",
  "rust",
  "toml",
  "md",
  "markdown",
  "diff",
  "text",
  "txt",
  "html",
  "css",
  "xml",
  "dockerfile",
  "ini",
  "env",
]);

const SHELL = new Set(["", "bash", "sh", "shell", "zsh", "console", "fish", "shellscript"]);

const PHASE_ORDER = { install: 0, build: 1, verify: 2 } as const;

type Candidate = {
  command: string;
  context: string;
  line: number;
  file: string;
};

export function planCommands(
  files: DocInput[],
  locks: LockHints,
): { plans: CommandPlan[]; skipped: SkippedCommand[] } {
  const skipped: SkippedCommand[] = [];
  const plans: CommandPlan[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    for (const candidate of extractCandidates(file)) {
      const phase = classifyCommand(candidate.command, candidate.context);
      if (!phase) continue;
      const key = candidate.command.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      const parsed = parseCdAndCommand(candidate.command);
      if (!parsed.ok) {
        skipped.push({
          command: candidate.command,
          file: candidate.file,
          line: candidate.line,
          reason: parsed.reason,
        });
        continue;
      }
      plans.push({
        phase,
        command: candidate.command.trim(),
        segments: parsed.segments,
        sourceFile: candidate.file,
        sourceLine: candidate.line,
        derived: false,
        network: phase === "install" ? "on" : "off",
      });
    }
  }

  const derived = deriveInstall(plans, locks);
  if (derived) plans.unshift(derived);

  plans.sort(
    (a, b) =>
      PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
      Number(b.derived) - Number(a.derived) ||
      a.sourceLine - b.sourceLine,
  );

  return { plans: capPlans(plans), skipped };
}

export function classifyCommand(
  command: string,
  context: string,
): "install" | "build" | "verify" | null {
  if (blocked(context) || blocked(command)) return null;
  const body = command.trim().replace(/^cd\s+\S+\s+&&\s+/, "");
  const manager = body.match(/^(npm|pnpm|yarn|bun)\s+(.+)$/);
  if (manager) {
    const rest = manager[2].trim();
    if (/^(ci|install)(\s|$)/.test(rest)) {
      const args = rest.replace(/^(ci|install)\s*/, "");
      const positional = args.split(/\s+/).filter((part) => part && !part.startsWith("-"));
      return positional.length === 0 ? "install" : null;
    }
    if (/^test(\s|$)/.test(rest)) return "verify";
    if (/^run\s+\S/.test(rest) || /^(build|lint|typecheck)\b/.test(rest)) {
      const name = rest.match(/^(?:run\s+)?([A-Za-z0-9:_./-]+)/)?.[1] ?? "";
      if (!name || shouldSkipScript(name)) return null;
      if (/build|prepare|compile|bundle/.test(name)) return "build";
      if (/test|lint|typecheck|check/.test(name)) return "verify";
    }
    return null;
  }

  if (/^(pip3?|uv|poetry|pdm)\s+(install|sync)\b/.test(body)) return "install";
  if (/^bundle\s+install\b/.test(body) || /^composer\s+install\b/.test(body)) return "install";
  if (/^cargo\s+fetch\b/.test(body) || /^go\s+mod\s+download\b/.test(body)) return "install";
  if (/^(cargo|go)\s+build\b/.test(body) || /^tsc\b/.test(body) || /^cmake\s+--build\b/.test(body)) {
    return "build";
  }
  if (/^make\b/.test(body) && /\b(zip|build|dist|compile)\b/.test(body)) return "build";
  if (/^(pytest|python3?\s+-m\s+pytest|go\s+test|cargo\s+test|ctest|make\s+test)\b/.test(body)) {
    return "verify";
  }
  if (/^(luajit|lua|lua5\.1)\s+\S/.test(body)) return "verify";
  return null;
}

function extractCandidates(file: DocInput): Candidate[] {
  const content = file.content.replace(/\r\n/g, "\n");
  const lines = content.split("\n");
  const found: Candidate[] = [];
  let section = "";
  let fence: { lang: string; lines: { n: number; text: string }[] } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (fence) {
      if (/^\s*```/.test(line)) {
        found.push(...commandsFromFence(file.path, fence));
        fence = null;
      } else {
        fence.lines.push({ n: lineNumber, text: line });
      }
      continue;
    }
    const fenceOpen = line.match(/^\s*```([A-Za-z0-9_+-]*)\s*$/);
    if (fenceOpen) {
      fence = { lang: (fenceOpen[1] || "").toLowerCase(), lines: [] };
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && !isSeparatorRow(line)) {
      found.push(...commandsFromTableRow(file.path, lineNumber, line));
      continue;
    }
    if (sectionLooksRelevant(section)) {
      found.push(...commandsFromInline(file.path, lineNumber, line, section));
    }
  }

  return found;
}

function commandsFromFence(
  file: string,
  fence: { lang: string; lines: { n: number; text: string }[] },
): Candidate[] {
  if (NON_SHELL.has(fence.lang)) return [];
  if (!SHELL.has(fence.lang)) return [];
  const found: Candidate[] = [];
  for (const line of fence.lines) {
    const text = stripPrompt(stripComment(line.text));
    if (!text || text.startsWith("#")) continue;
    for (const command of splitSteps(text)) {
      found.push({ command, context: line.text, line: line.n, file });
    }
  }
  return found;
}

function commandsFromTableRow(file: string, line: number, row: string): Candidate[] {
  const cells = row.split("|").slice(1, -1);
  const found: Candidate[] = [];
  for (const cell of cells) {
    for (const span of codeSpans(cell)) {
      const command = stripPrompt(stripComment(span));
      if (!command) continue;
      for (const step of splitSteps(command)) {
        found.push({ command: step, context: row, line, file });
      }
    }
  }
  return found;
}

function commandsFromInline(file: string, line: number, text: string, section: string): Candidate[] {
  if (blocked(text)) return [];
  const found: Candidate[] = [];
  for (const span of codeSpans(text)) {
    const command = stripPrompt(stripComment(span));
    if (!command) continue;
    for (const step of splitSteps(command)) {
      found.push({ command: step, context: `${section}\n${text}`, line, file });
    }
  }
  return found;
}

function codeSpans(cell: string): string[] {
  const spans: { start: number; value: string }[] = [];
  const pattern = /`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cell))) {
    spans.push({ start: match.index, value: match[1] });
  }
  const equals = cell.indexOf("=");
  const chosen = equals === -1 ? spans : spans.filter((span) => span.start < equals);
  return chosen.map((span) => span.value.trim()).filter(Boolean);
}

function deriveInstall(plans: CommandPlan[], locks: LockHints): CommandPlan | null {
  if (!locks.packageJson || plans.some((plan) => plan.phase === "install")) return null;
  const manager = plans
    .map((plan) => plan.segments[0]?.argv[0])
    .find((bin): bin is "npm" | "pnpm" | "yarn" | "bun" =>
      bin === "npm" || bin === "pnpm" || bin === "yarn" || bin === "bun",
    );
  if (!manager) return null;

  let command = "npm install";
  if (manager === "pnpm") command = locks.pnpmLock ? "pnpm install --frozen-lockfile" : "pnpm install";
  else if (manager === "yarn") command = locks.yarnLock ? "yarn install --frozen-lockfile" : "yarn install";
  else if (manager === "bun") command = "bun install";
  else command = locks.npmLock ? "npm ci" : "npm install";

  const parsed = parseCdAndCommand(command);
  if (!parsed.ok) return null;
  return {
    phase: "install",
    command,
    segments: parsed.segments,
    sourceFile: "package.json",
    sourceLine: 1,
    derived: true,
    network: "on",
  };
}

function capPlans(plans: CommandPlan[]): CommandPlan[] {
  if (plans.length <= 6) return plans;
  const install = plans.filter((plan) => plan.phase === "install");
  const build = plans.filter((plan) => plan.phase === "build");
  const verify = plans.filter((plan) => plan.phase === "verify");
  const head = [...install, ...build].slice(0, 6);
  return [...head, ...verify.slice(0, Math.max(0, 6 - head.length))];
}

function shouldSkipScript(name: string): boolean {
  if (/^(dev|start|serve|bench|benchmark|prof|profile|snap|release|publish|deploy|docs|typedoc|storybook)$/.test(name)) {
    return true;
  }
  if (/(live|perf|browser|e2e|fuzz|docker|watch)/.test(name)) return true;
  if (/(fix|format)/.test(name) && !/check/.test(name)) return true;
  return false;
}

function blocked(text: string): boolean {
  return /do not run|don't run|do _not_ run|never run|opt-in|costs tokens/i.test(text);
}

function sectionLooksRelevant(section: string): boolean {
  return /install|setup|getting started|development|build|test|verify|command|script|prerequisite|quick start|contrib|lint|check/i.test(
    section,
  );
}

function splitSteps(line: string): string[] {
  const trimmed = line.trim();
  if (/^cd\s+\S+\s+&&\s+/.test(trimmed)) return [trimmed];
  return trimmed
    .split(/\s*&&\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function stripComment(line: string): string {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trim();
  }
  return line.trim();
}

function stripPrompt(line: string): string {
  return line.replace(/^[$>]\s+/, "").trim();
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}
