import { getDb } from "@/lib/db";

const POLISH_TRANSCRIPT_KEY = "polish_transcript";

export async function getPolishTranscriptEnabled(): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT value FROM app_settings WHERE key = ?",
    args: [POLISH_TRANSCRIPT_KEY],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row?.value) return true;
  return String(row.value) !== "false";
}

export async function setPolishTranscriptEnabled(enabled: boolean): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO app_settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [POLISH_TRANSCRIPT_KEY, enabled ? "true" : "false", now],
  });
}

/** 未設定の DB に字幕校正 ON を初期値として書き込む */
export async function ensurePolishTranscriptDefault(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT OR IGNORE INTO app_settings (key, value, updated_at)
          VALUES (?, 'true', ?)`,
    args: [POLISH_TRANSCRIPT_KEY, now],
  });
}
