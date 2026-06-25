import { createClient, type Client } from "@libsql/client";

import { isVercel } from "@/lib/env";

const INIT_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    youtube_url   TEXT NOT NULL,
    youtube_id    TEXT,
    title         TEXT,
    thumbnail_url TEXT,
    duration_sec  INTEGER,
    status        TEXT NOT NULL DEFAULT 'pending',
    category_id   TEXT,
    transcript    TEXT,
    summary_json  TEXT,
    notes_html    TEXT,
    error_message TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gemini_usage_log (
    id              TEXT PRIMARY KEY,
    session_id      TEXT,
    operation       TEXT NOT NULL,
    model           TEXT NOT NULL,
    prompt_tokens   INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    total_tokens    INTEGER NOT NULL DEFAULT 0,
    latency_ms      INTEGER,
    success         INTEGER NOT NULL DEFAULT 1,
    error_code      TEXT,
    created_at      TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_usage_created_at ON gemini_usage_log(created_at DESC)`,
] as const;

const MIGRATION_STATEMENTS = [
  `ALTER TABLE sessions ADD COLUMN category_id TEXT`,
  `ALTER TABLE sessions ADD COLUMN transcript_raw TEXT`,
  `ALTER TABLE sessions ADD COLUMN visual_explainer_html TEXT`,
] as const;

const POST_MIGRATION_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_sessions_category_id ON sessions(category_id)`,
] as const;

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function resolveDatabaseUrl(): string {
  const configured = process.env.TURSO_DATABASE_URL?.trim();
  if (configured) return configured;

  if (isVercel()) {
    throw new Error(
      "TURSO_DATABASE_URL が未設定です。Vercel では Turso クラウド接続が必須です。",
    );
  }

  // ローカル開発用フォールバック（Turso 未設定時）
  return "file:data/sessions.db";
}

export function getClient(): Client {
  if (client) return client;

  const url = resolveDatabaseUrl();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

  client = createClient({
    url,
    authToken: url.startsWith("file:") ? undefined : authToken,
  });

  return client;
}

async function ensureSchema(): Promise<void> {
  const db = getClient();
  await db.batch(
    INIT_STATEMENTS.map((sql) => ({ sql, args: [] as never[] })),
  );

  for (const sql of MIGRATION_STATEMENTS) {
    try {
      await db.execute(sql);
    } catch {
      // column already exists on upgraded databases
    }
  }

  await db.batch(
    POST_MIGRATION_STATEMENTS.map((sql) => ({ sql, args: [] as never[] })),
  );

  await db.execute({
    sql: `INSERT OR IGNORE INTO app_settings (key, value, updated_at)
          VALUES ('polish_transcript', 'true', ?)`,
    args: [new Date().toISOString()],
  });

  const { ensureGeminiQuotaDefaults } = await import("@/lib/db/gemini-quota");
  await ensureGeminiQuotaDefaults();
}

export async function getDb(): Promise<Client> {
  if (!schemaReady) {
    schemaReady = ensureSchema();
  }
  await schemaReady;
  return getClient();
}

export function isTursoCloud(): boolean {
  const url = process.env.TURSO_DATABASE_URL?.trim() ?? "";
  return url.startsWith("libsql://") || url.startsWith("https://");
}
