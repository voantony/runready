"use client";

import { useEffect, useState } from "react";
import { formatDuration, formatWhen } from "../../../src/lib/format";
import type { RunRecord } from "../../../src/lib/types";
import { FixPanel } from "./fix-panel";

const terminal = new Set(["passed", "failed", "error"]);

export function ReportClient({ initial }: { initial: RunRecord }) {
  const [run, setRun] = useState(initial);

  useEffect(() => {
    if (terminal.has(run.status)) return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as RunRecord;
      setRun(next);
    }, 2000);
    return () => clearInterval(timer);
  }, [run.id, run.status]);

  const verdict = run.status === "passed" ? "PASS" : run.status === "failed" ? "FAIL" : run.status.toUpperCase();
  const tone =
    run.status === "passed" ? "text-pass" : run.status === "failed" || run.status === "error" ? "text-stamp" : "text-moss";

  return (
    <main className="py-6">
      <p className="font-mono text-xs tracking-wide text-moss">Proof {run.id}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl">
            {run.owner}/{run.project}
          </h1>
          <a className="mt-2 inline-block text-sm text-stamp" href={run.webUrl}>
            {run.webUrl}
          </a>
        </div>
        <p className={`stamp ${tone}`}>{verdict}</p>
      </div>

      <section className="ticket mt-6 p-5">
        <dl className="grid gap-3 font-mono text-xs text-moss sm:grid-cols-4">
          <div>
            <dt>Duration</dt>
            <dd className="mt-1 text-sm text-ink">{formatDuration(run.durationMs)}</dd>
          </div>
          <div>
            <dt>Sandbox</dt>
            <dd className="mt-1 text-sm text-ink">{run.sandbox || "pending"}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd className="mt-1 text-sm text-ink">{formatWhen(run.startedAt)}</dd>
          </div>
          <div>
            <dt>Host</dt>
            <dd className="mt-1 text-sm text-ink">{run.host}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm">
          Docs: {run.files.length ? run.files.join(", ") : "waiting for the clone"}
        </p>
        {run.notes.map((note) => (
          <p key={note} className="mt-2 text-sm text-moss">
            {note}
          </p>
        ))}
        {run.suggestedFix ? (
          <p className="mt-4 border-l-4 border-stamp bg-[#f8efe8] px-3 py-2 text-sm leading-6">{run.suggestedFix}</p>
        ) : null}
        {run.error ? <p className="mt-4 text-sm text-stamp">{run.error}</p> : null}
        {!terminal.has(run.status) ? (
          <p className="mt-4 font-mono text-xs text-moss">Running. This page refreshes every two seconds.</p>
        ) : null}
      </section>
      <FixPanel id={run.id} status={run.status} />

      <section className="mt-4">
        {run.steps.map((step, index) => (
          <article key={`${step.command}-${index}`} className="ticket mt-3 p-5">
            <header className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
              <span>
                {step.phase}
                {step.derived ? " · derived" : ""}
              </span>
              <span className={step.status === "passed" ? "text-pass" : step.status === "failed" ? "text-stamp" : "text-moss"}>
                {step.status}
              </span>
            </header>
            <pre className="mt-3 whitespace-pre-wrap font-mono text-sm">{step.command}</pre>
            <p className="mt-2 font-mono text-[11px] text-moss">
              {step.sourceFile ? `${step.sourceFile}${step.sourceLine ? `:${step.sourceLine}` : ""}` : "runner"} · exit{" "}
              {step.exitCode ?? "n/a"} · {formatDuration(step.durationMs)} · network {step.network}
              {step.truncated ? " · log truncated" : ""}
              {step.timedOut ? " · timed out" : ""}
            </p>
            {step.skipReason ? <p className="mt-2 text-sm text-moss">{step.skipReason}</p> : null}
            {step.log ? <pre className="log mt-3 bg-ink p-3 font-mono text-xs text-paper">{step.log}</pre> : null}
          </article>
        ))}
      </section>
    </main>
  );
}
