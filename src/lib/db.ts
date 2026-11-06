import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./config";
import type { RepoRef, RunRecord } from "./types";

const globalStore = globalThis as typeof globalThis & { __runreadyDb?: DatabaseSync };

function database(): DatabaseSync {
  if (!globalStore.__runreadyDb) {
    fs.mkdirSync(dataDir(), { recursive: true });
    const db = new DatabaseSync(path.join(dataDir(), "runready.sqlite"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        repo_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
    `);
    globalStore.__runreadyDb = db;
  }
  return globalStore.__runreadyDb;
}

export function closeDatabase(): void {
  globalStore.__runreadyDb?.close();
  globalStore.__runreadyDb = undefined;
}

export function createRun(repo: RepoRef, repoUrl: string): RunRecord {
  const record: RunRecord = {
    id: crypto.randomUUID(),
    repoUrl,
    webUrl: repo.webUrl,
    cloneUrl: repo.cloneUrl,
    host: repo.host,
    owner: repo.owner,
    project: repo.project,
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    sandbox: null,
    files: [],
    notes: [],
    steps: [],
    suggestedFix: null,
    error: null,
  };
  database()
    .prepare("INSERT INTO runs (id, status, repo_url, created_at, record_json) VALUES (?, ?, ?, ?, ?)")
    .run(record.id, record.status, record.repoUrl, record.createdAt, JSON.stringify(record));
  return record;
}

export function getRun(id: string): RunRecord | null {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = database()
    .prepare("SELECT record_json FROM runs WHERE id = ?")
    .get(id) as { record_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.record_json) as RunRecord;
}

export function saveRun(record: RunRecord): void {
  database()
    .prepare("UPDATE runs SET status = ?, record_json = ? WHERE id = ?")
    .run(record.status, JSON.stringify(record), record.id);
}
