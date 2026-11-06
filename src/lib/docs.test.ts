import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { loadDocs } from "./docs";
import { planCommands } from "./parser";
import { detectLocks } from "./docs";

test("falls back from screenshot-only AGENTS.md to CONTRIBUTING.md tests", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runready-docs-"));
  fs.writeFileSync(
    path.join(root, "AGENTS.md"),
    "# Agent notes\n\n## Screenshots\n\n```sh\ntools/emulator/shoot.sh smoke\n```\n",
  );
  fs.writeFileSync(
    path.join(root, "README.md"),
    "# Library\n\n## Install\n\nCopy the folder onto the device.\n\n## Development\n\nSee [CONTRIBUTING.md](CONTRIBUTING.md) for the tests.\n",
  );
  fs.writeFileSync(
    path.join(root, "CONTRIBUTING.md"),
    "# Contributing\n\n## Running the tests\n\nKOReader's own `luajit` binary works too: `make test LUA=/path/to/koreader/luajit`.\n\n```sh\nluajit spec/run.lua      # or: make test\n```\n\n## Building the release zip\n\n```sh\nmake zip VERSION=0.3.0\n```\n",
  );

  const loaded = loadDocs(root);
  assert.ok(loaded.files.some((file) => file.path === "CONTRIBUTING.md"));
  assert.match(loaded.notes[0] ?? "", /linked contributing docs/);
  const { plans } = planCommands(loaded.files, detectLocks(root));
  assert.deepEqual(
    plans.map((plan) => plan.command),
    ["make zip VERSION=0.3.0", "luajit spec/run.lua"],
  );
  fs.rmSync(root, { recursive: true, force: true });
});
