import type { StepResult } from "./types";

export function suggestFix(step: Pick<StepResult, "command" | "exitCode" | "log" | "network" | "timedOut">): string {
  const tail = step.log.slice(-2500);
  if (step.timedOut || step.exitCode === 124) {
    return `\`${step.command}\` exceeded the time limit. Document a command a clean machine can finish, or raise RUNREADY_COMMAND_TIMEOUT_MS. A dev server is not a proof.`;
  }
  if (step.exitCode === 127 || /not found|No such file or directory/i.test(tail)) {
    const bin = step.command.trim().split(/\s+/)[0] ?? "the command";
    return `\`${bin}\` is not on the runner. The unshare sandbox uses the host toolchain. Docker mode uses RUNREADY_DOCKER_IMAGE (default node:22-bookworm). Install the missing tool, or add a setup command to AGENTS.md.`;
  }
  if (/Missing script/i.test(tail)) {
    return `package.json has no script for \`${step.command}\`. Point the agent doc at a script that exists on a clean checkout.`;
  }
  if (/ERESOLVE|peer dep/i.test(tail)) {
    return "Dependency install failed on a clean tree. Commit a lockfile and document `npm ci`, or the frozen install for the package manager you use.";
  }
  if (
    step.network === "off" &&
    /ENOTFOUND|EAI_AGAIN|ENETUNREACH|network unreachable|getaddrinfo|ECONNREFUSED/i.test(tail)
  ) {
    return "This command tried to use the network. RunReady allows network access for install and turns it off for build and verify. Move downloads into the install step.";
  }
  if (/ELIFECYCLE|npm ERR!/i.test(tail)) {
    return `\`${step.command}\` failed on a clean checkout. The log tail is the failure. Fix the project, or change the command in the agent doc, so this step exits 0.`;
  }
  return `\`${step.command}\` exited ${step.exitCode ?? "without an exit code"}. Reproduce it from a clean clone and put the exact install, build, and verify commands in AGENTS.md.`;
}
