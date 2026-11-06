import assert from "node:assert/strict";
import test from "node:test";
import { suggestFix } from "./suggest";

test("suggests a missing tool and a network miss", () => {
  const missing = suggestFix({
    command: "luajit spec/run.lua",
    exitCode: 127,
    log: "bash: luajit: command not found",
    network: "off",
    timedOut: false,
  });
  assert.match(missing, /luajit/);
  assert.match(missing, /toolchain/);

  const offline = suggestFix({
    command: "npm test",
    exitCode: 1,
    log: "getaddrinfo ENOTFOUND registry.npmjs.org",
    network: "off",
    timedOut: false,
  });
  assert.match(offline, /network/);
});
