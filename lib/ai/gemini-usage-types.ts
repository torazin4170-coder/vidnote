export type GeminiOperation = "polish" | "summary" | "diagram";

export type GeminiCallContext = {
  sessionId?: string;
  operation: GeminiOperation;
};

export type GeminiUsageEvent = {
  id: string;
  sessionId: string | null;
  operation: GeminiOperation;
  model: string;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number | null;
  success: boolean;
  errorCode: string | null;
  createdAt: string;
};

export type GeminiUsageTotals = {
  requests: number;
  successes: number;
  failures: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type GeminiUsageSummary = {
  totals: GeminiUsageTotals;
  today: GeminiUsageTotals;
  lastMinute: GeminiUsageTotals;
  byOperation: Record<GeminiOperation, GeminiUsageTotals>;
  recent: GeminiUsageEvent[];
};

export type GeminiUsageQuota = {
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  minuteRequestLimit: number;
};

export type GeminiUsageGauge = {
  id: "daily-requests" | "daily-tokens" | "minute-requests";
  label: string;
  used: number;
  max: number;
  remaining: number;
  percent: number;
  unitLabel: string;
  hint: string;
};

export type GeminiRateLimitStatus = {
  callsPerVideo: number;
  remainingRequestsToday: number;
  remainingRequestsMinute: number;
  estimatedVideosRemainingToday: number;
  blockedByRpd: boolean;
  blockedByRpm: boolean;
  canProcessNow: boolean;
  canProcessOneVideo: boolean;
  nextResetLabel: string;
  throttleEnabled: boolean;
};
