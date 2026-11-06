import { getRun } from "../../../../../src/lib/db";
import { buildFixProposal } from "../../../../../src/lib/fixpr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = getRun(id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  const proposal = buildFixProposal(run);
  if (!proposal) return Response.json({ offer: false }, { status: 404 });
  return Response.json(proposal);
}
