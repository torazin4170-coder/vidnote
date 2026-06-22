import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const localDbPath = path.join(root, "data", "sessions.db");

function loadEnvLocal() {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!remoteUrl || remoteUrl.startsWith("file:")) {
  console.error("❌ TURSO_DATABASE_URL に Turso クラウド URL（libsql://...）を設定してください。");
  process.exit(1);
}

if (!authToken) {
  console.error("❌ TURSO_AUTH_TOKEN が未設定です。");
  process.exit(1);
}

if (!fs.existsSync(localDbPath)) {
  console.error(`❌ ローカル DB が見つかりません: ${localDbPath}`);
  process.exit(1);
}

const local = createClient({ url: `file:${localDbPath}` });
const remote = createClient({ url: remoteUrl, authToken });

const initStatements = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    youtube_url   TEXT NOT NULL,
    youtube_id    TEXT,
    title         TEXT,
    thumbnail_url TEXT,
    duration_sec  INTEGER,
    status        TEXT NOT NULL DEFAULT 'pending',
    transcript    TEXT,
    summary_json  TEXT,
    notes_html    TEXT,
    error_message TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC)`,
];

await remote.batch(initStatements.map((sql) => ({ sql, args: [] })));

const { rows } = await local.execute("SELECT * FROM sessions");
if (rows.length === 0) {
  console.log("ローカル DB にセッションがありません。移行は不要です。");
  process.exit(0);
}

let migrated = 0;
for (const row of rows) {
  const r = row;
  await remote.execute({
    sql: `INSERT OR REPLACE INTO sessions (
      id, youtube_url, youtube_id, title, thumbnail_url, duration_sec,
      status, transcript, summary_json, notes_html, error_message,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      r.id,
      r.youtube_url,
      r.youtube_id,
      r.title,
      r.thumbnail_url,
      r.duration_sec,
      r.status,
      r.transcript,
      r.summary_json,
      r.notes_html,
      r.error_message,
      r.created_at,
      r.updated_at,
    ],
  });
  migrated += 1;
}

console.log(`✅ ${migrated} 件のセッションを Turso に移行しました。`);
