import { createClient, type Client } from "@libsql/client";

import { isVercel } from "@/lib/env";

const INIT_STATEMENTS = [
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
