"use client";

import { useState } from "react";

export function RepoForm() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/ttttmr/pi-context");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = (await response.json()) as { error?: string; reportUrl?: string };
      if (!response.ok || !data.reportUrl) {
        setError(data.error || "Could not start the run.");
        setPending(false);
        return;
      }
      window.location.href = data.reportUrl;
    } catch {
      setError("The request did not reach the server.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="ticket p-4 sm:p-5">
      <label htmlFor="repoUrl" className="font-mono text-xs tracking-wide text-moss">
        Public repository URL
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="repoUrl"
          name="repoUrl"
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          placeholder="https://github.com/owner/repo"
          spellCheck={false}
          className="w-full border border-line bg-white px-3 py-3 font-mono text-sm outline-none focus:border-ink"
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-ink px-5 py-3 font-mono text-xs tracking-[0.14em] text-paper disabled:opacity-60"
        >
          {pending ? "STARTING" : "START PROOF"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-stamp">{error}</p> : null}
      <p className="mt-3 font-mono text-[11px] leading-5 text-moss">
        GitHub and GitLab HTTPS URLs. No tokens. The run starts in the background and opens a shareable report.
      </p>
    </form>
  );
}
