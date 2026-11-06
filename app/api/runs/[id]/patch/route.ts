import { getRun } from "../../../../../src/lib/db";
import { buildFixProposal } from "../../../../../src/lib/fixpr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = getRun(id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  const proposal = buildFixProposal(run);
  if (!proposal) return Response.json({ error: "This run does not need a fix patch." }, { status: 404 });
  return new Response(proposal.patch, {
    headers: {
      "content-type": "text/x-diff; charset=utf-8",
      "content-disposition": `attachment; filename="runready-${id.slice(0, 8)}.patch"`,
    },
  });
}
