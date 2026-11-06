import assert from "node:assert/strict";
import test from "node:test";
import type { FixProposal } from "./fixpr";
import { ForgeError, openPullRequest, type ForgeFetch, type ForgeResponse } from "./forge";

const proposal: FixProposal = {
  offer: true,
  kind: "incomplete",
  reasons: ["Docs were incomplete."],
  branch: "runready/agent-check-abcdef12",
  title: "docs: record clean-machine install commands in AGENTS",
  body: "Proof body",
  files: [
    { path: "AGENTS.md", content: "# AGENTS\n", mode: "100644", existed: true },
    { path: "scripts/agent-check", content: "#!/bin/sh\n", mode: "100755", existed: false },
  ],
  patch: "",
  instructions: "",
  canOpen: true,
  openBlocker: null,
};

function mockFetch(handler: (url: string, init: RequestInit) => ForgeResponse): ForgeFetch {
  return async (url, init) => handler(url, init ?? {});
}

test("opens a GitHub pull request on the upstream branch", async () => {
  const calls: string[] = [];
  const fetch = mockFetch((url, init) => {
    calls.push(`${init.method ?? "GET"} ${url}`);
    const auth = new Headers(init.headers).get("Authorization") ?? "";
    assert.equal(auth.includes("github-token"), true);
    assert.equal(url.startsWith("https://api.github.com/"), true);
    if (url.endsWith("/repos/acme/widget") && (init.method ?? "GET") === "GET") {
      return { status: 200, body: { default_branch: "main" } };
    }
    if (url.includes("/git/ref/heads/")) return { status: 200, body: { object: { sha: "aaa" } } };
    if (url.includes("/git/commits/aaa")) return { status: 200, body: { tree: { sha: "tree" } } };
    if (url.endsWith("/git/trees")) return { status: 201, body: { sha: "newtree" } };
    if (url.endsWith("/git/commits")) return { status: 201, body: { sha: "ddd" } };
    if (url.endsWith("/git/refs")) return { status: 201, body: { ref: "refs/heads/runready/agent-check-abcdef12" } };
    if (url.endsWith("/pulls")) {
      const body = JSON.parse(String(init.body));
      assert.equal(body.head, "runready/agent-check-abcdef12");
      return { status: 201, body: { html_url: "https://github.com/acme/widget/pull/9" } };
    }
    return { status: 500, body: { message: "unexpected" } };
  });

  const opened = await openPullRequest({
    host: "github",
    owner: "acme",
    project: "widget",
    token: "github-token",
    proposal,
    fetch,
  });
  assert.equal(opened.url, "https://github.com/acme/widget/pull/9");
  assert.equal(calls.some((call) => call.includes("/user")), false);
});

test("forks a GitHub repo when the token cannot push", async () => {
  let refs = 0;
  const fetch = mockFetch((url, init) => {
    const method = init.method ?? "GET";
    if (url.endsWith("/repos/acme/widget") && method === "GET") return { status: 200, body: { default_branch: "main" } };
    if (url.includes("/repos/acme/widget/git/ref/")) return { status: 403, body: { message: "Resource not accessible" } };
    if (url.endsWith("/user")) return { status: 200, body: { login: "octocat" } };
    if (url.endsWith("/repos/acme/widget/forks")) return { status: 202, body: { full_name: "octocat/widget" } };
    if (url.includes("/repos/octocat/widget/git/ref/")) return { status: 200, body: { object: { sha: "aaa" } } };
    if (url.includes("/git/commits/aaa")) return { status: 200, body: { tree: { sha: "tree" } } };
    if (url.endsWith("/git/trees")) return { status: 201, body: { sha: "newtree" } };
    if (url.endsWith("/git/commits")) return { status: 201, body: { sha: "ddd" } };
    if (url.endsWith("/git/refs")) {
      refs += 1;
      return { status: 201, body: {} };
    }
    if (url.endsWith("/pulls")) {
      const body = JSON.parse(String(init.body));
      assert.equal(body.head, "octocat:runready/agent-check-abcdef12");
      return { status: 201, body: { html_url: "https://github.com/acme/widget/pull/4" } };
    }
    return { status: 500, body: { message: url } };
  });

  const opened = await openPullRequest({
    host: "github",
    owner: "acme",
    project: "widget",
    token: "github-token",
    proposal,
    fetch,
  });
  assert.equal(opened.url, "https://github.com/acme/widget/pull/4");
  assert.equal(refs, 1);
});

test("opens a GitLab merge request", async () => {
  const fetch = mockFetch((url, init) => {
    const method = init.method ?? "GET";
    assert.equal(new Headers(init.headers).get("PRIVATE-TOKEN"), "gitlab-token");
    if (method === "GET" && url.includes("/projects/")) {
      return { status: 200, body: { id: 42, default_branch: "main" } };
    }
    if (url.endsWith("/repository/commits")) {
      const body = JSON.parse(String(init.body));
      assert.equal(body.actions[0].action, "update");
      assert.equal(body.actions[1].action, "create");
      return { status: 201, body: { id: "abc" } };
    }
    if (url.endsWith("/merge_requests")) {
      return { status: 201, body: { web_url: "https://gitlab.com/acme/widget/-/merge_requests/3" } };
    }
    return { status: 500, body: { message: url } };
  });

  const opened = await openPullRequest({
    host: "gitlab",
    owner: "acme",
    project: "widget",
    token: "gitlab-token",
    proposal,
    fetch,
  });
  assert.equal(opened.url, "https://gitlab.com/acme/widget/-/merge_requests/3");
});

test("strips token-shaped text from forge errors", async () => {
  const fetch = mockFetch(() => ({
    status: 401,
    body: { message: "bad ghp_abcdefghijklmnopqrstuvwxyz123456" },
  }));
  await assert.rejects(
    () =>
      openPullRequest({
        host: "github",
        owner: "acme",
        project: "widget",
        token: "github-token",
        proposal,
        fetch,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForgeError);
      assert.equal(error.message.includes("ghp_"), false);
      assert.match(error.message, /\[token\]/);
      return true;
    },
  );
});
