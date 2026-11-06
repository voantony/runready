import { getRun } from "../../../../../../src/lib/db";
import { buildFixProposal } from "../../../../../../src/lib/fixpr";
import { ForgeError, filesTouchToken, openPullRequest, tokenFor, type ForgeFetch } from "../../../../../../src/lib/forge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = getRun(id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  const proposal = buildFixProposal(run);
  if (!proposal) return Response.json({ error: "This run does not have a fix to open." }, { status: 404 });
  if (!proposal.canOpen) return Response.json({ error: proposal.openBlocker }, { status: 409 });

  const token = tokenFor(run.host);
  if (!token) {
    const name = run.host === "gitlab" ? "GITLAB_TOKEN" : "GITHUB_TOKEN";
    return Response.json(
      { error: `Set ${name} on the server to open the ${run.host === "gitlab" ? "merge request" : "pull request"}. The patch download works without it.` },
      { status: 400 },
    );
  }
  if (filesTouchToken(proposal.files, token)) {
    return Response.json({ error: "Refusing to commit a patch that contains the token." }, { status: 400 });
  }

  const fetchImpl: ForgeFetch = async (url, init) => {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  };

  try {
    const opened = await openPullRequest({
      host: run.host,
      owner: run.owner,
      project: run.project,
      token,
      proposal,
      fetch: fetchImpl,
    });
    return Response.json(opened);
  } catch (error) {
    const message = error instanceof ForgeError ? error.message : "The forge request failed.";
    const status = error instanceof ForgeError && error.status >= 400 && error.status < 500 ? error.status : 502;
    return Response.json({ error: message }, { status });
  }
}
