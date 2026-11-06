import { notFound } from "next/navigation";
import { getRun } from "../../../src/lib/db";
import { ReportClient } from "./report-client";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) notFound();
  return <ReportClient initial={run} />;
}
