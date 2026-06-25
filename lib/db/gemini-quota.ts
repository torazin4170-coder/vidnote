import { getClient, getDb } from "@/lib/db";
import type { GeminiUsageQuota } from "@/lib/ai/gemini-usage-types";

const KEYS = {
  dailyRequestLimit: "gemini_daily_request_limit",
  dailyTokenLimit: "gemini_daily_token_limit",
  minuteRequestLimit: "gemini_minute_request_limit",
} as const;

export const DEFAULT_GEMINI_QUOTA: GeminiUsageQuota = {
  dailyRequestLimit: 20,
  dailyTokenLimit: 250_000,
  minuteRequestLimit: 5,
};

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function readSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT value FROM app_settings WHERE key = ?",
    args: [key],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row?.value != null ? String(row.value) : null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO app_settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, value, now],
  });
}

export async function ensureGeminiQuotaDefaults(): Promise<void> {
  // ensureSchema 内から呼ばれるため getDb() は使わない（schemaReady 待ちでデッドロック）
  const db = getClient();
  const now = new Date().toISOString();
  const defaults: Array<[string, string]> = [
    [KEYS.dailyRequestLimit, String(DEFAULT_GEMINI_QUOTA.dailyRequestLimit)],
    [KEYS.dailyTokenLimit, String(DEFAULT_GEMINI_QUOTA.dailyTokenLimit)],
    [KEYS.minuteRequestLimit, String(DEFAULT_GEMINI_QUOTA.minuteRequestLimit)],
  ];

  for (const [key, value] of defaults) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
      args: [key, value, now],
    });
  }
}

export async function getGeminiUsageQuota(): Promise<GeminiUsageQuota> {
  const [dailyRequests, dailyTokens, minuteRequests] = await Promise.all([
    readSetting(KEYS.dailyRequestLimit),
    readSetting(KEYS.dailyTokenLimit),
    readSetting(KEYS.minuteRequestLimit),
  ]);

  return {
    dailyRequestLimit: parsePositiveInt(
      dailyRequests,
      DEFAULT_GEMINI_QUOTA.dailyRequestLimit,
    ),
    dailyTokenLimit: parsePositiveInt(
      dailyTokens,
      DEFAULT_GEMINI_QUOTA.dailyTokenLimit,
    ),
    minuteRequestLimit: parsePositiveInt(
      minuteRequests,
      DEFAULT_GEMINI_QUOTA.minuteRequestLimit,
    ),
  };
}

export async function setGeminiUsageQuota(
  patch: Partial<GeminiUsageQuota>,
): Promise<GeminiUsageQuota> {
  const current = await getGeminiUsageQuota();
  const next: GeminiUsageQuota = {
    dailyRequestLimit:
      patch.dailyRequestLimit ?? current.dailyRequestLimit,
    dailyTokenLimit: patch.dailyTokenLimit ?? current.dailyTokenLimit,
    minuteRequestLimit:
      patch.minuteRequestLimit ?? current.minuteRequestLimit,
  };

  await Promise.all([
    writeSetting(KEYS.dailyRequestLimit, String(next.dailyRequestLimit)),
    writeSetting(KEYS.dailyTokenLimit, String(next.dailyTokenLimit)),
    writeSetting(KEYS.minuteRequestLimit, String(next.minuteRequestLimit)),
  ]);

  return next;
}
