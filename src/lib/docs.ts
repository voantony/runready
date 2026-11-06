import fs from "node:fs";
import path from "node:path";
import { planCommands, type DocInput, type LockHints } from "./parser";

const PRIMARY = ["AGENTS.md", "CLAUDE.md", "install.md", "INSTALL.md"];
const READMES = ["README.md", "README.markdown", "Readme.md", "readme.md"];

export function detectLocks(repoDir: string): LockHints {
  const has = (name: string) => fs.existsSync(path.join(repoDir, name));
  return {
    packageJson: has("package.json"),
    npmLock: has("package-lock.json") || has("npm-shrinkwrap.json"),
    pnpmLock: has("pnpm-lock.yaml"),
    yarnLock: has("yarn.lock"),
  };
}

export function loadDocs(repoDir: string): { files: DocInput[]; notes: string[] } {
  const notes: string[] = [];
  const primary = PRIMARY.map((name) => readDoc(repoDir, name)).filter((file): file is DocInput => file !== null);
  if (primary.length > 0 && planCommands(primary, emptyLocks()).plans.length > 0) {
    return { files: primary, notes };
  }

  notes.push(
    primary.length > 0
      ? "AGENTS.md, CLAUDE.md, and install.md did not list install, build, or verify commands. RunReady used the README and linked contributing docs."
      : "No AGENTS.md, CLAUDE.md, or install.md was found. RunReady used the README and linked contributing docs.",
  );

  const readmes = READMES.map((name) => readDoc(repoDir, name)).filter((file): file is DocInput => file !== null);
  const linked: DocInput[] = [];
  const seen = new Set(primary.map((file) => file.path));
  for (const file of [...primary, ...readmes]) {
    for (const relativePath of linkedDocs(file.content)) {
      if (seen.has(relativePath)) continue;
      const doc = readDoc(repoDir, relativePath);
      if (!doc) continue;
      seen.add(relativePath);
      linked.push(doc);
    }
  }

  const files: DocInput[] = [];
  const paths = new Set<string>();
  for (const file of [...primary, ...readmes, ...linked]) {
    if (paths.has(file.path)) continue;
    paths.add(file.path);
    files.push(file);
  }
  return { files, notes };
}

export function linkedDocs(markdown: string): string[] {
  const found: string[] = [];
  const pattern = /\[[^\]]*\]\(([^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown))) {
    let href = match[1].trim();
    href = href.split("#")[0]?.split("?")[0] ?? href;
    if (!href || href.includes("://") || href.startsWith("/")) continue;
    const cleaned = href.replace(/^\.\//, "");
    if (!/(^|\/)(CONTRIBUTING|DEVELOPMENT|INSTALL|install)\.md$/i.test(cleaned)) continue;
    if (cleaned.split("/").some((part) => part === ".." || part === "")) continue;
    found.push(cleaned);
  }
  return found;
}

function readDoc(root: string, relativePath: string): DocInput | null {
  const rootResolved = path.resolve(root);
  const full = path.resolve(root, relativePath);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return null;
  if (!fs.existsSync(full)) return null;
  const stat = fs.statSync(full);
  if (!stat.isFile() || stat.size > 500_000) return null;
  return { path: relativePath, content: fs.readFileSync(full, "utf8") };
}

function emptyLocks(): LockHints {
  return { packageJson: false, npmLock: false, pnpmLock: false, yarnLock: false };
}
