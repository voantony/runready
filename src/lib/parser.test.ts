import assert from "node:assert/strict";
import test from "node:test";
import { planCommands } from "./parser";

const noLocks = { packageJson: false, npmLock: false, pnpmLock: false, yarnLock: false };

test("reads install, typecheck, and test from a command table and skips opt-in live tests", () => {
  const markdown = `
## COMMANDS
| Action | Command |
| --- | --- |
| Install | \`npm install\` |
| Typecheck | \`npm run typecheck\` |
| Test | \`npm test\` = typecheck + \`tsc\` emit |
| Live test | \`npm run test:live\` (opt-in: real model, costs tokens) |
| Run locally | \`pi --no-skills\` |
`;
  const { plans } = planCommands([{ path: "AGENTS.md", content: markdown }], noLocks);
  assert.deepEqual(
    plans.map((plan) => plan.command),
    ["npm install", "npm run typecheck", "npm test"],
  );
  assert.equal(plans[0].network, "on");
  assert.equal(plans[2].network, "off");
  assert.equal(plans[0].phase, "install");
  assert.equal(plans[2].phase, "verify");
});

test("reads a bash fence and skips benchmarks and consumer installs", () => {
  const agents = `
## Commands
\`\`\`bash
$ npm test
npm run lint
npm run bench
npm run build
\`\`\`
`;
  const readme = `
## Install
\`\`\`sh
npm install ky
\`\`\`
`;
  const { plans } = planCommands(
    [
      { path: "AGENTS.md", content: agents },
      { path: "README.md", content: readme },
    ],
    { packageJson: true, npmLock: true, pnpmLock: false, yarnLock: false },
  );
  assert.deepEqual(
    plans.map((plan) => `${plan.phase}:${plan.command}`),
    ["install:npm ci", "build:npm run build", "verify:npm test", "verify:npm run lint"],
  );
  assert.equal(plans[0].derived, true);
});

test("parses luajit and make zip, ignoring commented alternatives", () => {
  const contributing = `
## Running the tests

The tests need LuaJIT. KOReader's own \`luajit\` binary works too: \`make test LUA=/path/to/koreader/luajit\`.

\`\`\`sh
luajit spec/run.lua      # or: make test
\`\`\`

## Building the release zip
\`\`\`sh
make zip VERSION=0.3.0
\`\`\`

## Testing in the emulator
\`\`\`sh
tools/emulator/shoot.sh smoke
python3 tools/make_dummy_library.py --out ~/dummy-library
\`\`\`
`;
  const { plans, skipped } = planCommands(
    [{ path: "CONTRIBUTING.md", content: contributing }],
    noLocks,
  );
  assert.deepEqual(
    plans.map((plan) => plan.command),
    ["make zip VERSION=0.3.0", "luajit spec/run.lua"],
  );
  assert.equal(skipped.some((skip) => skip.command.includes("LUA=/path")), true);
});

test("skips a build the doc says not to run", () => {
  const markdown = `
| Command | Purpose |
| --- | --- |
| \`npm run lint\` | Lint |
| \`npm run build\` | Production build. Do not run during agent sessions |
`;
  const { plans } = planCommands([{ path: "AGENTS.md", content: markdown }], noLocks);
  assert.deepEqual(
    plans.map((plan) => plan.command),
    ["npm run lint"],
  );
});
