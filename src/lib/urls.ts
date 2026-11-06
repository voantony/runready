import type { RepoRef } from "./types";

const SEGMENT = /^[A-Za-z0-9._+-]+$/;

export function parseRepoUrl(input: string): RepoRef {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 500) {
    throw new Error("Enter an https://github.com or https://gitlab.com repository URL.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Enter an https://github.com or https://gitlab.com repository URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed. RunReady clones public repositories only.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed. RunReady clones public repositories only.");
  }
  if (url.port) {
    throw new Error("Custom ports are not allowed.");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "github.com" && host !== "gitlab.com") {
    throw new Error("Only github.com and gitlab.com URLs are supported.");
  }

  let parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });

  if (host === "gitlab.com") {
    const dash = parts.indexOf("-");
    if (dash !== -1) parts = parts.slice(0, dash);
  }

  if (parts.length > 0) {
    parts[parts.length - 1] = parts[parts.length - 1].replace(/\.git$/i, "");
  }

  if (host === "github.com") {
    if (
      parts.length >= 4 &&
      (parts[2] === "tree" || parts[2] === "blob" || parts[2] === "commit")
    ) {
      parts = parts.slice(0, 2);
    }
    if (parts.length !== 2) {
      throw new Error("Use a repository URL like https://github.com/owner/name.");
    }
  } else if (parts.length < 2) {
    throw new Error("Use a repository URL like https://gitlab.com/group/project.");
  }

  for (const part of parts) {
    if (part === "." || part === ".." || !SEGMENT.test(part)) {
      throw new Error("The repository path contains unsupported characters.");
    }
  }

  const project = parts[parts.length - 1];
  const owner = parts.slice(0, -1).join("/");
  const repoPath = parts.join("/");
  return {
    host: host === "github.com" ? "github" : "gitlab",
    owner,
    project,
    webUrl: `https://${host}/${repoPath}`,
    cloneUrl: `https://${host}/${repoPath}.git`,
  };
}
