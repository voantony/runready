import assert from "node:assert/strict";
import test from "node:test";
import { parseRepoUrl } from "./urls";

test("parses github repo urls and tree links", () => {
  const repo = parseRepoUrl("https://github.com/ttttmr/pi-context/tree/main");
  assert.equal(repo.host, "github");
  assert.equal(repo.owner, "ttttmr");
  assert.equal(repo.project, "pi-context");
  assert.equal(repo.cloneUrl, "https://github.com/ttttmr/pi-context.git");
});

test("parses gitlab nested groups and strips blob routes", () => {
  const repo = parseRepoUrl(
    "https://www.gitlab.com/antonyvo/koreader-library-gui/-/blob/main/AGENTS.md",
  );
  assert.equal(repo.host, "gitlab");
  assert.equal(repo.owner, "antonyvo");
  assert.equal(repo.cloneUrl, "https://gitlab.com/antonyvo/koreader-library-gui.git");

  const nested = parseRepoUrl("https://gitlab.com/group/sub.group/project.git");
  assert.equal(nested.owner, "group/sub.group");
  assert.equal(nested.project, "project");
});

test("rejects credentials, ssh, and other hosts", () => {
  assert.throws(() => parseRepoUrl("https://user:token@github.com/o/r"), /credentials/);
  assert.throws(() => parseRepoUrl("git@github.com:o/r.git"), /https:\/\/github.com/);
  assert.throws(() => parseRepoUrl("ssh://git@github.com/o/r.git"), /Only HTTPS/);
  assert.throws(() => parseRepoUrl("https://bitbucket.org/o/r"), /github.com and gitlab.com/);
  assert.throws(() => parseRepoUrl("https://github.com/o/r/issues/1"), /repository URL/);
});
