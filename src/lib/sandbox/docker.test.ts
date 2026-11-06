import assert from "node:assert/strict";
import test from "node:test";
import { dockerRunArgs } from "./docker";

test("docker verify runs with network off, no caps, and no host secrets", () => {
  const previous = process.env.RUNREADY_HOST_PROBE;
  process.env.RUNREADY_HOST_PROBE = "host-only-probe-value";
  const args = dockerRunArgs({
    name: "runready-abc",
    workdir: "/tmp/repo",
    cwd: ".",
    network: "off",
    timeoutSec: 30,
    image: "node:22-bookworm",
    uid: 1000,
    gid: 1000,
    argv: ["npm", "test"],
  });
  assert.equal(args[args.indexOf("--network") + 1], "none");
  assert.ok(args.includes("--cap-drop"));
  assert.ok(args.includes("no-new-privileges"));
  assert.equal(args.at(-2), "npm");
  assert.equal(args.at(-1), "test");
  assert.equal(args.some((arg) => arg.includes("host-only-probe-value")), false);
  if (previous === undefined) delete process.env.RUNREADY_HOST_PROBE;
  else process.env.RUNREADY_HOST_PROBE = previous;
});
