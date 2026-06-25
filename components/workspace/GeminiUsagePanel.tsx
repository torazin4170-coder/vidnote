"use client";

import { useEffect, useState } from "react";

import type {
  GeminiRateLimitStatus,
  GeminiUsageGauge,
  GeminiUsageQuota,
  GeminiUsageSummary,
} from "@/lib/ai/gemini-usage-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const OPERATION_LABELS = {
  polish: "字幕校正",
  summary: "要点生成",
  diagram: "図解生成",
} as const;

function formatCount(value: number): string {
  return value.toLocaleString("ja-JP");
}

function formatUsageLine(totals: {
  requests: number;
  totalTokens: number;
  failures: number;
}): string {
  return `${formatCount(totals.requests)} 回 / ${formatCount(totals.totalTokens)} トークン（失敗 ${formatCount(totals.failures)}）`;
}

function gaugeTone(percent: number, used: number, max: number): string {
  if (used > max) return "bg-destructive";
  if (percent >= 90) return "bg-destructive";
  if (percent >= 70) return "bg-accent";
  return "bg-primary";
}

function RateLimitBanner({ rateLimit }: { rateLimit: GeminiRateLimitStatus }) {
  const tone =
    rateLimit.estimatedVideosRemainingToday === 0
      ? "border-destructive/40 bg-destructive/5"
      : rateLimit.estimatedVideosRemainingToday <= 2
        ? "border-border bg-accent/30"
        : "border-border bg-muted/30";

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3", tone)}>
      <p className="text-sm font-medium">
        本日あと約{" "}
        <span className="tabular-nums">
          {formatCount(rateLimit.estimatedVideosRemainingToday)}
        </span>{" "}
        本処理可能
      </p>
      <p className="text-xs text-muted-foreground">
        1本あたり約 {rateLimit.callsPerVideo} 回の API 呼び出し（校正・要約・図解）。
        本日残り {formatCount(rateLimit.remainingRequestsToday)} 回 / 直近1分残り{" "}
        {formatCount(rateLimit.remainingRequestsMinute)} 回。
      </p>
      {rateLimit.throttleEnabled ? (
        <p className="text-xs text-muted-foreground">
          RPM 上限に達すると自動で待機してから再開します（429 を抑止）。
        </p>
      ) : null}
      {!rateLimit.canProcessOneVideo ? (
        <p className="text-xs text-destructive">
          {rateLimit.blockedByRpd
            ? `日次上限のため新規処理は ${rateLimit.nextResetLabel} まで待機キューに入ります。`
            : "1分あたり上限のため、1〜2分後に自動再開します。"}
        </p>
      ) : null}
    </div>
  );
}

function UsageGaugeBar({ gauge }: { gauge: GeminiUsageGauge }) {
  const overLimit = gauge.used > gauge.max;
  const fillWidth = overLimit ? 100 : gauge.percent;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{gauge.label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {overLimit ? "上限超過" : `残り ${formatCount(gauge.remaining)}`}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={gauge.max}
        aria-valuenow={gauge.used}
        aria-label={gauge.label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            gaugeTone(gauge.percent, gauge.used, gauge.max),
          )}
          style={{ width: `${fillWidth}%` }}
        />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
        <span>
          <span className="font-medium tabular-nums">{formatCount(gauge.used)}</span>
          <span className="text-muted-foreground">
            {" "}
            / {formatCount(gauge.max)} {gauge.unitLabel}
          </span>
        </span>
        <span className="text-muted-foreground">{gauge.percent}%</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{gauge.hint}</p>
    </div>
  );
}

type GeminiUsagePanelProps = {
  active: boolean;
};

export function GeminiUsagePanel({ active }: GeminiUsagePanelProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<GeminiUsageSummary | null>(null);
  const [gauges, setGauges] = useState<GeminiUsageGauge[]>([]);
  const [quotaDraft, setQuotaDraft] = useState<GeminiUsageQuota | null>(null);
  const [rateLimit, setRateLimit] = useState<GeminiRateLimitStatus | null>(null);

  const loadUsage = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gemini/usage", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        summary?: GeminiUsageSummary | null;
        quota?: GeminiUsageQuota | null;
        gauges?: GeminiUsageGauge[];
        rateLimit?: GeminiRateLimitStatus | null;
      };
      setSummary(data.summary ?? null);
      setGauges(data.gauges ?? []);
      setRateLimit(data.rateLimit ?? null);
      if (data.quota) setQuotaDraft(data.quota);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    void loadUsage();
  }, [active]);

  const saveQuota = async () => {
    if (!quotaDraft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/gemini/usage", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quotaDraft),
      });
      const data = (await res.json()) as {
        error?: string;
        gauges?: GeminiUsageGauge[];
        quota?: GeminiUsageQuota;
        rateLimit?: GeminiRateLimitStatus | null;
      };
      if (!res.ok) {
        alert(data.error ?? "上限の保存に失敗しました");
        return;
      }
      if (data.quota) setQuotaDraft(data.quota);
      if (data.gauges) setGauges(data.gauges);
      if (data.rateLimit) setRateLimit(data.rateLimit);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="font-medium">Gemini 利用量</span>
      <p className="text-muted-foreground">
        Google AI Studio の Quota 画面の数値を「上限」に設定すると、残量をゲージで確認できます。
        記録はこの VidNote からの呼び出しのみです。
      </p>

      {loading ? (
        <p className="text-muted-foreground">読み込み中…</p>
      ) : summary && quotaDraft ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
          {rateLimit ? <RateLimitBanner rateLimit={rateLimit} /> : null}
          <div className="flex flex-col gap-3">
            {gauges.map((gauge) => (
              <UsageGaugeBar key={gauge.id} gauge={gauge} />
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="text-xs font-medium">上限の設定（AI Studio の値を入力）</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">1分あたり（RPM）</span>
                <Input
                  type="number"
                  min={1}
                  value={quotaDraft.minuteRequestLimit}
                  onChange={(e) =>
                    setQuotaDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            minuteRequestLimit: Number(e.target.value) || 1,
                          }
                        : prev,
                    )
                  }
                  className="h-8 bg-card"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">1日あたり（RPD）</span>
                <Input
                  type="number"
                  min={1}
                  value={quotaDraft.dailyRequestLimit}
                  onChange={(e) =>
                    setQuotaDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            dailyRequestLimit: Number(e.target.value) || 1,
                          }
                        : prev,
                    )
                  }
                  className="h-8 bg-card"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">1日トークン（TPD）</span>
                <Input
                  type="number"
                  min={1}
                  value={quotaDraft.dailyTokenLimit}
                  onChange={(e) =>
                    setQuotaDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            dailyTokenLimit: Number(e.target.value) || 1,
                          }
                        : prev,
                    )
                  }
                  className="h-8 bg-card"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => void saveQuota()}
              >
                {saving ? "保存中…" : "上限を保存"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={() => void loadUsage()}
              >
                再読み込み
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <span className="text-xs font-medium">累計</span>
            <span className="text-xs">{formatUsageLine(summary.totals)}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium">処理別（累計）</span>
            {(
              Object.entries(OPERATION_LABELS) as Array<
                [keyof typeof OPERATION_LABELS, string]
              >
            ).map(([key, label]) => (
              <span key={key} className="text-xs text-muted-foreground">
                {label}: {formatUsageLine(summary.byOperation[key])}
              </span>
            ))}
          </div>

          {summary.recent.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">直近の呼び出し</span>
              <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-background">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-2 py-1 font-medium">時刻</th>
                      <th className="px-2 py-1 font-medium">処理</th>
                      <th className="px-2 py-1 font-medium">結果</th>
                      <th className="px-2 py-1 font-medium">tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recent.map((event) => (
                      <tr
                        key={event.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-2 py-1 whitespace-nowrap">
                          {new Date(event.createdAt).toLocaleString("ja-JP", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-2 py-1">
                          {OPERATION_LABELS[event.operation]}
                        </td>
                        <td className="px-2 py-1">
                          {event.success
                            ? "成功"
                            : event.errorCode
                              ? `失敗 (${event.errorCode})`
                              : "失敗"}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {formatCount(event.totalTokens)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">利用量を取得できませんでした。</p>
      )}
    </div>
  );
}
