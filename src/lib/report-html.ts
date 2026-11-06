import { formatDuration, formatWhen } from "./format";
import type { RunRecord } from "./types";

export function renderReportHtml(run: RunRecord): string {
  const verdict = run.status === "passed" ? "PASS" : run.status === "failed" ? "FAIL" : run.status.toUpperCase();
  const steps = run.steps
    .map((step) => {
      const source = step.sourceFile
        ? `${escapeHtml(step.sourceFile)}${step.sourceLine ? `:${step.sourceLine}` : ""}${step.derived ? " (derived)" : ""}`
        : "runner";
      return `<article class="step">
        <header>
          <span class="phase">${escapeHtml(step.phase)}</span>
          <strong class="${escapeHtml(step.status)}">${escapeHtml(step.status)}</strong>
        </header>
        <pre class="cmd">${escapeHtml(step.command)}</pre>
        <p class="meta">source ${source} · exit ${step.exitCode ?? "n/a"} · ${escapeHtml(formatDuration(step.durationMs))} · network ${step.network}${step.truncated ? " · log truncated" : ""}</p>
        ${step.skipReason ? `<p class="note">${escapeHtml(step.skipReason)}</p>` : ""}
        ${step.log ? `<pre class="log">${escapeHtml(step.log)}</pre>` : ""}
      </article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>RunReady ${verdict} · ${escapeHtml(run.owner)}/${escapeHtml(run.project)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; background: #f3ecdf; color: #1b1714; font-family: Palatino, "Palatino Linotype", Georgia, serif; }
    main { max-width: 880px; margin: 0 auto; padding: 40px 20px 72px; }
    h1 { font-weight: 500; letter-spacing: -0.03em; margin-bottom: 0.2rem; }
    a { color: #6d2a22; }
    .stamp { display: inline-block; border: 3px solid currentColor; padding: 0.15rem 0.55rem; font-family: ui-monospace, monospace; letter-spacing: 0.14em; transform: rotate(-6deg); }
    .pass { color: #1d6b45; } .fail, .error { color: #9c2f2f; } .skipped, .running, .queued { color: #6b6258; }
    .ticket { background: #fffaf3; border: 1px solid #d9d0c1; padding: 22px; margin-top: 22px; }
    .meta, .note { font-family: ui-monospace, monospace; font-size: 12px; color: #5c564e; }
    .step { border-top: 1px dashed #d9d0c1; padding: 16px 0; }
    .step header { display: flex; justify-content: space-between; gap: 12px; font-family: ui-monospace, monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    pre { white-space: pre-wrap; word-break: break-word; background: #221e1a; color: #f3ecdf; padding: 12px; overflow: auto; }
    .cmd { background: transparent; color: inherit; padding: 8px 0; font-size: 16px; }
    .fix { border-left: 4px solid #9c2f2f; padding: 8px 12px; background: #f8efe8; }
  </style>
</head>
<body>
  <main>
    <p class="meta">RunReady proof · ${escapeHtml(run.id)}</p>
    <h1>${escapeHtml(run.owner)}/${escapeHtml(run.project)}</h1>
    <p><a href="${escapeHtml(run.webUrl)}">${escapeHtml(run.webUrl)}</a></p>
    <p class="stamp ${escapeHtml(run.status)}">${verdict}</p>
    <section class="ticket">
      <p class="meta">created ${escapeHtml(formatWhen(run.createdAt))} · duration ${escapeHtml(formatDuration(run.durationMs))} · sandbox ${escapeHtml(run.sandbox || "n/a")}</p>
      <p>Docs read: ${run.files.length ? escapeHtml(run.files.join(", ")) : "none"}</p>
      ${run.notes.map((note) => `<p class="note">${escapeHtml(note)}</p>`).join("")}
      ${run.suggestedFix ? `<p class="fix">${escapeHtml(run.suggestedFix)}</p>` : ""}
      ${run.error ? `<p class="fix">${escapeHtml(run.error)}</p>` : ""}
      ${steps || "<p>No commands ran.</p>"}
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
