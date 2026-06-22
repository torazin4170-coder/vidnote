import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

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

const url = process.env.TURSO_DATABASE_URL?.trim() || "file:data/sessions.db";
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

const client = createClient({
  url,
  authToken: url.startsWith("file:") ? undefined : authToken,
});

const statements = [
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

await client.batch(statements.map((sql) => ({ sql, args: [] })));

console.log("✅ データベーススキーマを初期化しました。");
console.log(`   URL: ${url.startsWith("file:") ? url : url.replace(/\/\/.*@/, "//***@")}`);
if (url.startsWith("file:")) {
  console.log("");
  console.log("ローカルファイルモードです。Vercel 公開時は Turso クラウド URL を設定してください。");
}
