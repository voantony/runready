# Good first issues

Five starter tasks. Each one is a gap in the current tree, small enough to land as a single merge request. File one with the [good first issue](.gitlab/issue_templates/Good%20first%20issue.md) template, or just open a merge request that meets the acceptance criteria.

## 1. Call a GitLab fix a merge request

**Why it matters.** A proof of a GitLab project still shows a button labeled `OPEN PULL REQUEST` in `app/runs/[id]/fix-panel.tsx`. The API already opens a merge request when `run.host` is `gitlab` (`src/lib/fixpr.ts` writes `.gitlab-ci.yml` in that case). The label is the part that is wrong.

**Where to start.** `FixPanel` only receives `id` and `status`. `ReportClient` in `app/runs/[id]/report-client.tsx` has `run.host`. Pass that through and choose the label there.

**Acceptance criteria.**

- A GitLab report says "Open merge request". A GitHub report still says "Open pull request".
- The download and open endpoints are unchanged.
- A test or a small rendered check covers both labels.

## 2. Classify `dotnet build` and `dotnet test`

**Why it matters.** `dotnet` is already in the sandbox allowlist (`BINS` in `src/lib/safety.ts`), so a documented command would be allowed to run. `classifyCommand` in `src/lib/parser.ts` never assigns it a phase, so `dotnet build` and `dotnet test` are dropped before the sandbox starts.

**Where to start.** `classifyCommand` already maps `cargo build` / `cargo test` and `go build` / `go test`. Add the `dotnet` pair next to those patterns. Cover it in `src/lib/parser.test.ts`.

**Acceptance criteria.**

- `dotnet build` is a build step and `dotnet test` is a verify step.
- `dotnet run` and `dotnet publish` are not selected.
- Existing parser tests still pass.

## 3. Say which commands the six-command cap dropped

**Why it matters.** `capPlans` in `src/lib/parser.ts` keeps at most six commands and discards the rest with no record. A repository whose docs list eight test commands gets a passing report that never mentions the two that did not run.

**Where to start.** `planCommands` already returns a `skipped` array for commands the safety check refused. Append the commands `capPlans` removes, with a stable reason string. The report already renders `skipReason` on a step (`app/runs/[id]/report-client.tsx`).

**Acceptance criteria.**

- A document with more than six selected commands keeps the same six `capPlans` would keep today.
- Each dropped command appears in `skipped` with the file, line, and a reason that names the cap.
- A test in `src/lib/parser.test.ts` locks the count and the reason.

## 4. Follow `HACKING.md` and `DEVELOPING.md`

**Why it matters.** When `AGENTS.md` has no install commands, `loadDocs` in `src/lib/docs.ts` reads the README and one linked doc. `linkedDocs` only keeps paths ending in `CONTRIBUTING.md`, `DEVELOPMENT.md`, or `INSTALL.md`. A README that points at `HACKING.md` or `docs/developing.md` is ignored, and the proof fails with "no commands found".

**Where to start.** The allowlist is the regular expression in `linkedDocs`. `src/lib/docs.test.ts` already builds a temp repo whose README links to `CONTRIBUTING.md`. Copy that shape.

**Acceptance criteria.**

- A relative link to `HACKING.md` or `docs/developing.md` is loaded and its fenced commands are planned.
- Links with `..`, an absolute path, or another host are still ignored.
- The existing CONTRIBUTING fallback test still passes.

## 5. Fail proofs left queued after a restart

**Why it matters.** `enqueueRun` in `src/lib/queue.ts` keeps the in-flight set in memory and starts `executeRun` with `setTimeout`. If the Node process exits, the row stays `queued` or `running`. `ReportClient` polls `/api/runs/:id` every two seconds and never reaches a terminal status.

**Where to start.** Add a function beside `getRun` in `src/lib/db.ts` that sets `status` to `error`, sets `error` to a message about the process restart, and sets `finishedAt`. Call it once when the server process opens the database, not on every request, so a run that is actually in `inflight` is left alone. `closeDatabase` is already how tests reset the handle.

**Acceptance criteria.**

- A row saved as `running` or `queued` becomes `error` after the sweep, and the message tells the reader to start the proof again.
- A run enqueued in the current process is not swept.
- `npm test` covers the sweep: point `RUNREADY_DATA_DIR` at a temporary directory, call `closeDatabase()` from `src/lib/db.ts`, insert a `running` row, run the sweep, and assert the stored record.
