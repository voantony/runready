import { getRun, saveRun } from "./db";
import { executeRun } from "./execute";

/**
 * In-process driver. POST /api/runs returns as soon as the row exists.
 * Replace `enqueueRun` with a worker queue later. The pipeline in
 * `executeRun` does not need to stay on the web process.
 */
const inflight = new Set<string>();

export function enqueueRun(id: string): void {
  if (inflight.has(id)) return;
  inflight.add(id);
  setTimeout(() => {
    void executeRun(id)
      .catch((error: unknown) => {
        const run = getRun(id);
        if (!run || (run.status !== "queued" && run.status !== "running")) return;
        run.status = "error";
        run.error = error instanceof Error ? error.message : "The run failed.";
        run.finishedAt = new Date().toISOString();
        saveRun(run);
      })
      .finally(() => {
        inflight.delete(id);
      });
  }, 20);
}
