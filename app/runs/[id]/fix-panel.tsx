"use client";

import { useEffect, useState } from "react";
import type { FixProposal } from "../../../src/lib/fixpr";

export function FixPanel({ id, status }: { id: string; status: string }) {
  const [proposal, setProposal] = useState<FixProposal | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === "queued" || status === "running") return;
    let cancelled = false;
    void fetch(`/api/runs/${id}/fix`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as FixProposal;
      })
      .then((next) => {
        if (!cancelled) setProposal(next);
      })
      .catch(() => {
        if (!cancelled) setProposal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, status]);

  if (!proposal) return null;

  async function openRequest() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/runs/${id}/fix/open`, { method: "POST" });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setMessage(data.error || "Could not open the request.");
      } else {
        setMessage(data.url);
      }
    } catch {
      setMessage("The request did not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="ticket mt-4 p-5">
      <p className="font-mono text-xs tracking-[0.16em] text-stamp">
        {proposal.kind === "failed" ? "FIX PR" : "DOCS PR"}
      </p>
      <h2 className="mt-2 text-2xl">{proposal.title}</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-moss">
        {proposal.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-xs text-moss">Branch {proposal.branch}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={`/api/runs/${id}/patch`}
          className="border border-ink px-3 py-2 font-mono text-xs tracking-[0.14em]"
        >
          DOWNLOAD PATCH
        </a>
        <button
          type="button"
          onClick={() => void openRequest()}
          disabled={pending || !proposal.canOpen}
          className="bg-ink px-3 py-2 font-mono text-xs tracking-[0.14em] text-paper disabled:opacity-50"
        >
          {pending ? "OPENING" : "OPEN PULL REQUEST"}
        </button>
      </div>
      {proposal.openBlocker ? <p className="mt-3 text-sm text-moss">{proposal.openBlocker}</p> : null}
      {message ? (
        <p className="mt-3 text-sm">
          {message.startsWith("http") ? (
            <a className="text-stamp" href={message}>
              {message}
            </a>
          ) : (
            message
          )}
        </p>
      ) : null}
      <pre className="log mt-4 bg-ink p-3 font-mono text-xs text-paper">{proposal.instructions}</pre>
      {proposal.files.map((file) => (
        <details key={file.path} className="mt-3">
          <summary className="cursor-pointer font-mono text-xs">
            {file.path} {file.existed ? "(update)" : "(new)"}
          </summary>
          <pre className="log mt-2 bg-[#f7f1e6] p-3 font-mono text-xs">{file.content}</pre>
        </details>
      ))}
    </section>
  );
}
