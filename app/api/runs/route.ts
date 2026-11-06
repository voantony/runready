import { createRun } from "../../../src/lib/db";
import { enqueueRun } from "../../../src/lib/queue";
import { parseRepoUrl } from "../../../src/lib/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON with a repoUrl." }, { status: 400 });
  }

  const repoUrl =
    body && typeof body === "object" && "repoUrl" in body ? (body as { repoUrl?: unknown }).repoUrl : null;
  if (typeof repoUrl !== "string") {
    return Response.json({ error: "repoUrl must be a string." }, { status: 400 });
  }

  try {
    const repo = parseRepoUrl(repoUrl);
    const run = createRun(repo, repoUrl.trim());
    enqueueRun(run.id);
    return Response.json({ id: run.id, reportUrl: `/runs/${run.id}` }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the run.";
    return Response.json({ error: message }, { status: 400 });
  }
}
