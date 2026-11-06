import fs from "node:fs";
import path from "node:path";
import { createRun, getRun } from "../src/lib/db";
import { executeRun } from "../src/lib/execute";
import { renderReportHtml } from "../src/lib/report-html";
import { parseRepoUrl } from "../src/lib/urls";

const url = process.argv[2];
const outBase = process.argv[3];

if (!url || !outBase) {
  console.error("Usage: npm run proof -- <github-or-gitlab-url> <output-base>");
  process.exit(2);
}

async function main(repoUrl: string, outputBase: string): Promise<void> {
  const repo = parseRepoUrl(repoUrl);
  const created = createRun(repo, repoUrl);
  console.log(`run ${created.id} ${repo.cloneUrl}`);
  await executeRun(created.id);
  const done = getRun(created.id);
  if (!done) {
    console.error("Run record disappeared.");
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(path.resolve(outputBase)), { recursive: true });
  fs.writeFileSync(`${outputBase}.json`, JSON.stringify(done, null, 2));
  fs.writeFileSync(`${outputBase}.html`, renderReportHtml(done));

  console.log(`status ${done.status} sandbox ${done.sandbox ?? "n/a"} duration ${done.durationMs ?? "n/a"}ms`);
  for (const step of done.steps) {
    console.log(
      `  ${step.status.padEnd(7)} exit=${String(step.exitCode ?? "-").padStart(3)} ${step.phase.padEnd(7)} ${step.command}`,
    );
  }
  if (done.suggestedFix) console.log(`fix: ${done.suggestedFix}`);
  if (done.error) console.error(done.error);
  console.log(`wrote ${outputBase}.json and ${outputBase}.html`);
  process.exit(done.status === "error" ? 1 : 0);
}

void main(url, outBase);
