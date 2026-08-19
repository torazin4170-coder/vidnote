import { getDb } from "@/lib/db";

const POLISH_TRANSCRIPT_KEY = "polish_transcript";
const SUMMARY_CUSTOM_PROMPT_KEY = "summary_custom_prompt";
const TRANSCRIPT_RELAY_URL_KEY = "transcript_relay_url";
const TRANSCRIPT_RELAY_UPDATED_AT_KEY = "transcript_relay_url_updated_at";

export const SUMMARY_CUSTOM_PROMPT_MAX_LENGTH = 4000;

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

export async function getTranscriptRelayUrl(): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT value FROM app_settings WHERE key = ?",
    args: [TRANSCRIPT_RELAY_URL_KEY],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  const value = row?.value ? String(row.value).trim() : "";
  return value || null;
}

export async function setTranscriptRelayUrl(url: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.batch([
    {
      sql: `INSERT INTO app_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: [TRANSCRIPT_RELAY_URL_KEY, url, now],
    },
    {
      sql: `INSERT INTO app_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: [TRANSCRIPT_RELAY_UPDATED_AT_KEY, now, now],
    },
  ]);
}

export async function getSummaryCustomPrompt(): Promise<string> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT value FROM app_settings WHERE key = ?",
    args: [SUMMARY_CUSTOM_PROMPT_KEY],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row?.value ? String(row.value) : "";
}

export async function setSummaryCustomPrompt(prompt: string): Promise<void> {
  const trimmed = prompt.trim();
  if (trimmed.length > SUMMARY_CUSTOM_PROMPT_MAX_LENGTH) {
    throw new Error(
      `カスタム要約指示は ${SUMMARY_CUSTOM_PROMPT_MAX_LENGTH} 文字以内にしてください`,
    );
  }
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO app_settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [SUMMARY_CUSTOM_PROMPT_KEY, trimmed, now],
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
