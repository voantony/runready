import type { FixFile, FixProposal } from "./fixpr";
import type { Host } from "./types";

export type ForgeResponse = {
  status: number;
  body: unknown;
};

export type ForgeFetch = (url: string, init: RequestInit) => Promise<ForgeResponse>;

export class ForgeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function openPullRequest(input: {
  host: Host;
  owner: string;
  project: string;
  token: string;
  proposal: FixProposal;
  fetch: ForgeFetch;
}): Promise<{ url: string }> {
  if (input.host === "gitlab") return openGitLab(input);
  return openGitHub(input);
}

async function openGitHub(input: {
  owner: string;
  project: string;
  token: string;
  proposal: FixProposal;
  fetch: ForgeFetch;
}): Promise<{ url: string }> {
  const upstream = `${input.owner}/${input.project}`;
  const base = await githubJson<{ default_branch: string }>(input, `/repos/${upstream}`);
  const committed = await commitGitHub(input, upstream, base.default_branch, input.proposal);
  if (committed.ok) {
    const pull = await githubJson<{ html_url: string }>(input, `/repos/${upstream}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: input.proposal.title,
        body: input.proposal.body,
        head: input.proposal.branch,
        base: base.default_branch,
      }),
    });
    return { url: pull.html_url };
  }

  const user = await githubJson<{ login: string }>(input, "/user");
  await githubJson(input, `/repos/${upstream}/forks`, { method: "POST", body: "{}" });
  const fork = `${user.login}/${input.project}`;
  let forkError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await commitGitHub(input, fork, base.default_branch, input.proposal, true);
      forkError = undefined;
      break;
    } catch (error) {
      forkError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (forkError) throw forkError;
  const pull = await githubJson<{ html_url: string }>(input, `/repos/${upstream}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: input.proposal.title,
      body: input.proposal.body,
      head: `${user.login}:${input.proposal.branch}`,
      base: base.default_branch,
    }),
  });
  return { url: pull.html_url };
}

async function commitGitHub(
  input: { token: string; proposal: FixProposal; fetch: ForgeFetch },
  fullName: string,
  baseBranch: string,
  proposal: FixProposal,
  required = false,
): Promise<{ ok: boolean }> {
  try {
    const ref = await githubJson<{ object: { sha: string } }>(
      input,
      `/repos/${fullName}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
    );
    const commit = await githubJson<{ tree: { sha: string } }>(input, `/repos/${fullName}/git/commits/${ref.object.sha}`);
    const tree = await githubJson<{ sha: string }>(input, `/repos/${fullName}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit.tree.sha,
        tree: proposal.files.map((file) => ({
          path: file.path,
          mode: file.mode,
          type: "blob",
          content: file.content,
        })),
      }),
    });
    const next = await githubJson<{ sha: string }>(input, `/repos/${fullName}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: proposal.title,
        tree: tree.sha,
        parents: [ref.object.sha],
      }),
    });
    await githubJson(input, `/repos/${fullName}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${proposal.branch}`, sha: next.sha }),
    });
    return { ok: true };
  } catch (error) {
    if (!required && error instanceof ForgeError && (error.status === 403 || error.status === 404)) {
      return { ok: false };
    }
    throw error;
  }
}

async function openGitLab(input: {
  owner: string;
  project: string;
  token: string;
  proposal: FixProposal;
  fetch: ForgeFetch;
}): Promise<{ url: string }> {
  const projectPath = encodeURIComponent(`${input.owner}/${input.project}`);
  const project = await gitlabJson<{ id: number; default_branch: string }>(input, `/projects/${projectPath}`);
  const committed = await commitGitLab(input, project.id, project.default_branch, input.proposal);
  if (committed.ok) {
    const mr = await gitlabJson<{ web_url: string }>(input, `/projects/${project.id}/merge_requests`, {
      method: "POST",
      body: JSON.stringify({
        source_branch: input.proposal.branch,
        target_branch: project.default_branch,
        title: input.proposal.title,
        description: input.proposal.body,
      }),
    });
    return { url: mr.web_url };
  }

  const fork = await gitlabJson<{ id: number }>(input, `/projects/${project.id}/fork`, {
    method: "POST",
    body: "{}",
  });
  await commitGitLab(input, fork.id, project.default_branch, input.proposal, true);
  const mr = await gitlabJson<{ web_url: string }>(input, `/projects/${fork.id}/merge_requests`, {
    method: "POST",
    body: JSON.stringify({
      source_branch: input.proposal.branch,
      target_branch: project.default_branch,
      target_project_id: project.id,
      title: input.proposal.title,
      description: input.proposal.body,
    }),
  });
  return { url: mr.web_url };
}

async function commitGitLab(
  input: { token: string; proposal: FixProposal; fetch: ForgeFetch },
  projectId: number,
  baseBranch: string,
  proposal: FixProposal,
  required = false,
): Promise<{ ok: boolean }> {
  try {
    await gitlabJson(input, `/projects/${projectId}/repository/commits`, {
      method: "POST",
      body: JSON.stringify({
        branch: proposal.branch,
        start_branch: baseBranch,
        commit_message: proposal.title,
        actions: proposal.files.map((file) => ({
          action: file.existed ? "update" : "create",
          file_path: file.path,
          content: file.content,
        })),
      }),
    });
    return { ok: true };
  } catch (error) {
    if (!required && error instanceof ForgeError && (error.status === 403 || error.status === 404)) {
      return { ok: false };
    }
    throw error;
  }
}

async function githubJson<T>(
  input: { token: string; fetch: ForgeFetch },
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await githubRaw(input, path, init);
  if (response.status >= 400) {
    throw new ForgeError(githubMessage(response.body) || `GitHub request failed (${response.status}).`, response.status);
  }
  return response.body as T;
}

async function githubRaw(
  input: { token: string; fetch: ForgeFetch },
  path: string,
  init: RequestInit = {},
): Promise<ForgeResponse> {
  return input.fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "runready",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

async function gitlabJson<T>(
  input: { token: string; fetch: ForgeFetch },
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await gitlabRaw(input, path, init);
  if (response.status >= 400) {
    throw new ForgeError(githubMessage(response.body) || `GitLab request failed (${response.status}).`, response.status);
  }
  return response.body as T;
}

async function gitlabRaw(
  input: { token: string; fetch: ForgeFetch },
  path: string,
  init: RequestInit = {},
): Promise<ForgeResponse> {
  return input.fetch(`https://gitlab.com/api/v4${path}`, {
    ...init,
    headers: {
      "PRIVATE-TOKEN": input.token,
      "Content-Type": "application/json",
      "User-Agent": "runready",
    },
  });
}

function githubMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as { message?: unknown; error?: unknown };
  const message = typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : "";
  return message.replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[token]").replace(/glpat-[A-Za-z0-9_-]+/g, "[token]");
}

export function tokenFor(host: Host, env: Record<string, string | undefined> = process.env): string | null {
  const value = host === "gitlab" ? env.GITLAB_TOKEN : env.GITHUB_TOKEN;
  const token = value?.trim();
  return token ? token : null;
}

export function filesTouchToken(files: FixFile[], token: string): boolean {
  return files.some((file) => file.content.includes(token));
}
