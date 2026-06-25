import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db";
import type {
  GeminiOperation,
  GeminiRateLimitStatus,
  GeminiUsageEvent,
  GeminiUsageGauge,
  GeminiUsageQuota,
  GeminiUsageSummary,
  GeminiUsageTotals,
} from "@/lib/ai/gemini-usage-types";
import {
  getGeminiUsageQuota,
} from "@/lib/db/gemini-quota";

type RecordGeminiUsageInput = {
  sessionId?: string;
  operation: GeminiOperation;
  model: string;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  success: boolean;
  errorCode?: string | null;
};

function emptyTotals(): GeminiUsageTotals {
  return {
    requests: 0,
    successes: 0,
    failures: 0,
    promptTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function mapTotals(row: Record<string, unknown>): GeminiUsageTotals {
  return {
    requests: Number(row.requests ?? 0),
    successes: Number(row.successes ?? 0),
    failures: Number(row.failures ?? 0),
    promptTokens: Number(row.prompt_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    totalTokens: Number(row.total_tokens ?? 0),
  };
}

function mapEvent(row: Record<string, unknown>): GeminiUsageEvent {
  return {
    id: String(row.id),
    sessionId: row.session_id != null ? String(row.session_id) : null,
    operation: String(row.operation) as GeminiOperation,
    model: String(row.model),
    promptTokens: Number(row.prompt_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    totalTokens: Number(row.total_tokens ?? 0),
    latencyMs: row.latency_ms != null ? Number(row.latency_ms) : null,
    success: Number(row.success) === 1,
    errorCode: row.error_code != null ? String(row.error_code) : null,
    createdAt: String(row.created_at),
  };
}

export async function recordGeminiUsage(
  input: RecordGeminiUsageInput,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO gemini_usage_log (
            id, session_id, operation, model,
            prompt_tokens, output_tokens, total_tokens,
            latency_ms, success, error_code, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      input.sessionId ?? null,
      input.operation,
      input.model,
      input.promptTokens ?? 0,
      input.outputTokens ?? 0,
      input.totalTokens ?? 0,
      input.latencyMs ?? null,
      input.success ? 1 : 0,
      input.errorCode ?? null,
      now,
    ],
  });
}

async function queryTotals(since?: string): Promise<GeminiUsageTotals> {
  const db = await getDb();
  const where = since ? "WHERE created_at >= ?" : "";
  const result = await db.execute({
    sql: `SELECT
            COUNT(*) AS requests,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
            COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(SUM(total_tokens), 0) AS total_tokens
          FROM gemini_usage_log
          ${where}`,
    args: since ? [since] : [],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapTotals(row) : emptyTotals();
}

async function queryTotalsByOperation(): Promise<
  Record<GeminiOperation, GeminiUsageTotals>
> {
  const db = await getDb();
  const result = await db.execute(`
    SELECT
      operation,
      COUNT(*) AS requests,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens
    FROM gemini_usage_log
    GROUP BY operation
  `);

  const base: Record<GeminiOperation, GeminiUsageTotals> = {
    polish: emptyTotals(),
    summary: emptyTotals(),
    diagram: emptyTotals(),
  };

  for (const row of result.rows) {
    const op = String((row as Record<string, unknown>).operation) as GeminiOperation;
    if (op in base) {
      base[op] = mapTotals(row as Record<string, unknown>);
    }
  }

  return base;
}

export async function getOldestUsageSince(
  sinceIso: string,
): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT MIN(created_at) AS oldest FROM gemini_usage_log WHERE created_at >= ?`,
    args: [sinceIso],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row?.oldest == null) return null;
  return String(row.oldest);
}

function buildGauge(
  id: GeminiUsageGauge["id"],
  label: string,
  used: number,
  max: number,
  unitLabel: string,
  hint: string,
): GeminiUsageGauge {
  const safeMax = Math.max(1, max);
  const remaining = Math.max(0, max - used);
  const percent = Math.min(100, Math.round((used / safeMax) * 100));
  return {
    id,
    label,
    used,
    max,
    remaining,
    percent,
    unitLabel,
    hint,
  };
}

export function buildGeminiUsageGauges(
  summary: Pick<GeminiUsageSummary, "today" | "lastMinute">,
  quota: GeminiUsageQuota,
): GeminiUsageGauge[] {
  return [
    buildGauge(
      "minute-requests",
      "直近1分のリクエスト（RPM 目安）",
      summary.lastMinute.requests,
      quota.minuteRequestLimit,
      "回",
      "429 の多くはこの枠超過です",
    ),
    buildGauge(
      "daily-requests",
      "今日のリクエスト（RPD 目安）",
      summary.today.requests,
      quota.dailyRequestLimit,
      "回",
      "1日あたりの呼び出し上限の目安",
    ),
    buildGauge(
      "daily-tokens",
      "今日のトークン（TPD 目安）",
      summary.today.totalTokens,
      quota.dailyTokenLimit,
      "tokens",
      "入力+出力の合計トークン",
    ),
  ];
}

export async function getGeminiUsageSummary(): Promise<GeminiUsageSummary> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const minuteStart = new Date(Date.now() - 60_000).toISOString();

  const db = await getDb();
  const recentResult = await db.execute({
    sql: `SELECT *
          FROM gemini_usage_log
          ORDER BY datetime(created_at) DESC
          LIMIT 20`,
    args: [],
  });

  return {
    totals: await queryTotals(),
    today: await queryTotals(todayStart.toISOString()),
    lastMinute: await queryTotals(minuteStart),
    byOperation: await queryTotalsByOperation(),
    recent: recentResult.rows.map((row) =>
      mapEvent(row as Record<string, unknown>),
    ),
  };
}

export async function getGeminiUsageReport(): Promise<{
  summary: GeminiUsageSummary;
  quota: GeminiUsageQuota;
  gauges: GeminiUsageGauge[];
  rateLimit: GeminiRateLimitStatus;
}> {
  const { getGeminiRateLimitStatus } = await import("@/lib/ai/gemini-rate-limit");
  const [summary, quota, rateLimit] = await Promise.all([
    getGeminiUsageSummary(),
    getGeminiUsageQuota(),
    getGeminiRateLimitStatus(),
  ]);
  return {
    summary,
    quota,
    gauges: buildGeminiUsageGauges(summary, quota),
    rateLimit,
  };
}
