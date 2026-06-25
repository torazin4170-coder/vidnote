import type { GeminiRateLimitStatus } from "@/lib/ai/gemini-usage-types";
import { getOldestUsageSince, getGeminiUsageSummary } from "@/lib/db/gemini-usage";
import { getGeminiUsageQuota } from "@/lib/db/gemini-quota";
import { getPolishTranscriptEnabled } from "@/lib/db/settings";

const MAX_RPM_WAIT_MS = 5 * 60_000;

function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export class GeminiDailyQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiDailyQuotaExceededError";
  }
}

function nextMidnightLocalLabel(): string {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return next.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function getGeminiRateLimitStatus(): Promise<GeminiRateLimitStatus> {
  const [quota, summary, polishEnabled] = await Promise.all([
    getGeminiUsageQuota(),
    getGeminiUsageSummary(),
    isGeminiConfigured() ? getPolishTranscriptEnabled() : Promise.resolve(false),
  ]);

  const callsPerVideo =
    isGeminiConfigured() && polishEnabled ? 3 : isGeminiConfigured() ? 2 : 0;
  const remainingRequestsToday = Math.max(
    0,
    quota.dailyRequestLimit - summary.today.requests,
  );
  const remainingRequestsMinute = Math.max(
    0,
    quota.minuteRequestLimit - summary.lastMinute.requests,
  );
  const estimatedVideosRemainingToday =
    callsPerVideo > 0
      ? Math.floor(remainingRequestsToday / callsPerVideo)
      : 0;

  const blockedByRpd = remainingRequestsToday < 1;
  const blockedByRpm = remainingRequestsMinute < 1;
  const canProcessNow =
    !blockedByRpd &&
    remainingRequestsToday >= callsPerVideo &&
    !blockedByRpm;

  return {
    callsPerVideo,
    remainingRequestsToday,
    remainingRequestsMinute,
    estimatedVideosRemainingToday,
    blockedByRpd,
    blockedByRpm,
    canProcessNow,
    canProcessOneVideo:
      !blockedByRpd && remainingRequestsToday >= callsPerVideo,
    nextResetLabel: nextMidnightLocalLabel(),
    throttleEnabled: true,
  };
}

export async function assertCanStartVideoProcessing(): Promise<void> {
  const status = await getGeminiRateLimitStatus();
  if (!isGeminiConfigured()) return;
  if (status.canProcessOneVideo) return;

  if (status.blockedByRpd || status.remainingRequestsToday < status.callsPerVideo) {
    throw new GeminiDailyQuotaExceededError(
      `本日の Gemini 呼び出し上限に達しました（残り ${status.remainingRequestsToday} 回 / 1本あたり約 ${status.callsPerVideo} 回）。${status.nextResetLabel} 以降に再試行してください。`,
    );
  }
}

export async function waitForGeminiSlot(): Promise<void> {
  if (!isGeminiConfigured()) return;

  const started = Date.now();
  while (Date.now() - started < MAX_RPM_WAIT_MS) {
    const quota = await getGeminiUsageQuota();
    const summary = await getGeminiUsageSummary();

    if (summary.today.requests >= quota.dailyRequestLimit) {
      throw new GeminiDailyQuotaExceededError(
        `本日の Gemini 呼び出し上限（${quota.dailyRequestLimit} 回/日）に達しました。${nextMidnightLocalLabel()} 以降に再試行してください。`,
      );
    }

    if (summary.lastMinute.requests < quota.minuteRequestLimit) {
      return;
    }

    const minuteStart = new Date(Date.now() - 60_000).toISOString();
    const oldest = await getOldestUsageSince(minuteStart);
    const waitMs = oldest
      ? Math.min(
          90_000,
          Math.max(1_000, new Date(oldest).getTime() + 60_001 - Date.now()),
        )
      : 13_000;

    console.info(
      `[gemini-throttle] RPM ${summary.lastMinute.requests}/${quota.minuteRequestLimit} — ${waitMs}ms 待機`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error(
    "Gemini の 1 分あたり上限の待機がタイムアウトしました。1〜2 分後に再試行してください。",
  );
}
