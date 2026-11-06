import type { CommandSegment } from "./types";

const BINS = new Set([
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "corepack",
  "python",
  "python3",
  "pip",
  "pip3",
  "uv",
  "poetry",
  "pytest",
  "cargo",
  "rustc",
  "go",
  "make",
  "cmake",
  "luajit",
  "lua",
  "lua5.1",
  "tsc",
  "bundle",
  "composer",
  "dotnet",
  "mvn",
  "gradle",
]);

const SECRET_ENV = /SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIAL|AUTH/i;

export type ParsedCommand =
  | { ok: true; segments: CommandSegment[] }
  | { ok: false; reason: string };

export function parseCommand(input: string): ParsedCommand {
  const command = input.trim();
  if (!command) return { ok: false, reason: "Empty command." };
  if (command.length > 500) return { ok: false, reason: "Command is too long." };
  if (/[|&;<>`$()\n\r\\]/.test(command)) {
    return {
      ok: false,
      reason: "Pipes, redirects, command substitution, and statement separators are not allowed.",
    };
  }
  if (command.includes("&&")) {
    return { ok: false, reason: "Chain this as separate documented commands." };
  }

  let tokens: string[];
  try {
    tokens = tokenize(command);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not parse command." };
  }

  const env: Record<string, string> = {};
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
    const token = tokens[index];
    const eq = token.indexOf("=");
    const name = token.slice(0, eq);
    const value = token.slice(eq + 1);
    if (SECRET_ENV.test(name)) {
      return { ok: false, reason: `Refusing to set ${name}. Runs have no secrets.` };
    }
    if (!/^[A-Za-z0-9_./:=,@+-]+$/.test(value) || value.length > 120) {
      return { ok: false, reason: `Refusing environment value for ${name}.` };
    }
    env[name] = value;
    index += 1;
  }

  let cwd = ".";
  if (tokens[index] === "cd") {
    const dir = tokens[index + 1];
    if (!dir || !isRelativeDir(dir) || tokens.length !== index + 2) {
      return { ok: false, reason: "cd is only allowed as a relative directory before the command." };
    }
    cwd = dir;
    return { ok: false, reason: "A cd by itself is not a command." };
  }

  const argv = tokens.slice(index);
  if (argv.length === 0) return { ok: false, reason: "Command is missing a program." };
  if (argv.length > 24) return { ok: false, reason: "Command has too many arguments." };

  const bin = argv[0];
  if (!isAllowedBin(bin)) {
    return { ok: false, reason: `Program \`${bin}\` is not in the allowlist.` };
  }

  for (const arg of argv.slice(1)) {
    if (arg.length > 300) return { ok: false, reason: "An argument is too long." };
    if (
      arg.startsWith("/") ||
      arg.includes("..") ||
      arg.includes("~") ||
      /=\//.test(arg) ||
      /https?:\/\//i.test(arg)
    ) {
      return { ok: false, reason: `Refusing argument \`${arg}\`.` };
    }
  }

  return { ok: true, segments: [{ argv, env, cwd }] };
}

export function parseCdAndCommand(input: string): ParsedCommand {
  const match = input.trim().match(/^cd\s+(\S+)\s+&&\s+([\s\S]+)$/);
  if (!match) return parseCommand(input);
  const dir = match[1];
  if (!isRelativeDir(dir)) {
    return { ok: false, reason: "cd target must stay inside the repository." };
  }
  const parsed = parseCommand(match[2]);
  if (!parsed.ok) return parsed;
  if (parsed.segments.length !== 1 || parsed.segments[0].cwd !== ".") {
    return { ok: false, reason: "Could not apply cd to that command." };
  }
  parsed.segments[0].cwd = dir;
  return parsed;
}

function isAllowedBin(bin: string): boolean {
  if (BINS.has(bin)) return true;
  if (!/^[A-Za-z0-9._@/-]+$/.test(bin)) return false;
  if (bin.startsWith("/") || bin.includes("..") || bin.includes("~")) return false;
  return bin.startsWith("./") || bin.includes("/");
}

function isRelativeDir(dir: string): boolean {
  if (!dir || dir.startsWith("/") || dir.includes("..") || dir.includes("~")) return false;
  return /^[A-Za-z0-9._@/-]+$/.test(dir);
}

function tokenize(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (quote) throw new Error("Command has unbalanced quotes.");
  if (current) out.push(current);
  return out;
}
