"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";

import type { Session, SessionStatus } from "@/lib/schema";
import type { FocusMode } from "@/lib/schema";
import { STATUS_LABELS } from "@/lib/labels";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";
import { GeminiUsagePanel } from "@/components/workspace/GeminiUsagePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type GlobalHeaderProps = {
  session: Session | null;
  focusMode: FocusMode;
  geminiConfigured: boolean;
  onFocusModeChange: (mode: FocusMode) => void;
};

function statusBadgeVariant(
  status: SessionStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "error") return "destructive";
  if (status === "done") return "outline";
  if (
    status === "fetching_captions" ||
    status === "polishing_transcript" ||
    status === "summarizing"
  ) {
    return "default";
  }
  return "secondary";
}

export function GlobalHeader({
  session,
  focusMode,
  geminiConfigured,
  onFocusModeChange,
}: GlobalHeaderProps) {
  const title = session?.title ?? "セッション未選択";
  const [polishTranscript, setPolishTranscript] = useState(true);
  const [summaryCustomPrompt, setSummaryCustomPrompt] = useState("");
  const [summaryCustomPromptDraft, setSummaryCustomPromptDraft] = useState("");
  const [summaryCustomPromptMaxLength, setSummaryCustomPromptMaxLength] =
    useState(2000);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [summaryPromptSaving, setSummaryPromptSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          polishTranscript?: boolean;
          summaryCustomPrompt?: string;
          summaryCustomPromptMaxLength?: number;
        };
        if (!cancelled) {
          if (typeof data.polishTranscript === "boolean") {
            setPolishTranscript(data.polishTranscript);
          }
          if (typeof data.summaryCustomPrompt === "string") {
            setSummaryCustomPrompt(data.summaryCustomPrompt);
            setSummaryCustomPromptDraft(data.summaryCustomPrompt);
          }
          if (typeof data.summaryCustomPromptMaxLength === "number") {
            setSummaryCustomPromptMaxLength(data.summaryCustomPromptMaxLength);
          }
        }
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePolishTranscript = async () => {
    if (!geminiConfigured || settingsSaving) return;
    const next = !polishTranscript;
    setSettingsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polishTranscript: next }),
      });
      const data = (await res.json()) as {
        polishTranscript?: boolean;
        error?: string;
      };
      if (!res.ok) {
        alert(data.error ?? "設定の更新に失敗しました");
        return;
      }
      if (typeof data.polishTranscript === "boolean") {
        setPolishTranscript(data.polishTranscript);
      }
    } finally {
      setSettingsSaving(false);
    }
  };

  const summaryPromptDirty =
    summaryCustomPromptDraft.trim() !== summaryCustomPrompt.trim();

  const saveSummaryCustomPrompt = async () => {
    if (!geminiConfigured || summaryPromptSaving) return;
    setSummaryPromptSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryCustomPrompt: summaryCustomPromptDraft }),
      });
      const data = (await res.json()) as {
        summaryCustomPrompt?: string;
        error?: string;
      };
      if (!res.ok) {
        alert(data.error ?? "設定の更新に失敗しました");
        return;
      }
      if (typeof data.summaryCustomPrompt === "string") {
        setSummaryCustomPrompt(data.summaryCustomPrompt);
        setSummaryCustomPromptDraft(data.summaryCustomPrompt);
      }
    } finally {
      setSummaryPromptSaving(false);
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <Breadcrumb
        className="min-w-0 flex-1 overflow-hidden"
        aria-label="パンくず"
      >
        <BreadcrumbList className="flex-nowrap text-[11px]">
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate font-medium">
              VidNote / {title}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex shrink-0 items-center gap-1">
        {session && (
          <Badge variant={statusBadgeVariant(session.status)}>
            {STATUS_LABELS[session.status]}
          </Badge>
        )}

        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {(
            [
              ["all", "全表示"],
              ["transcript", "字幕"],
              ["notes", "ノート"],
            ] as const
          ).map(([mode, label]) => (
            <Button
              key={mode}
              type="button"
              size="xs"
              variant={focusMode === mode ? "secondary" : "ghost"}
              onClick={() => onFocusModeChange(mode)}
            >
              {label}
            </Button>
          ))}
        </div>

        <ThemeToggle />

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DialogTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="設定"
                      >
                        <Settings />
                      </Button>
                    }
                  />
                }
              />
              <TooltipContent>設定</TooltipContent>
            </Tooltip>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>設定</DialogTitle>
              <DialogDescription>
                API キーはサーバー側の .env.local のみに保存されます。
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-col gap-1">
                <span className="font-medium">Gemini API</span>
                <span className="text-muted-foreground">
                  {geminiConfigured
                    ? "設定済み（GEMINI_API_KEY）"
                    : "未設定 — 字幕取得のみ利用可能"}
                </span>
              </div>
              {geminiConfigured ? (
                <div className="flex flex-col gap-2">
                  <span className="font-medium">字幕校正（AI）</span>
                  <p className="text-muted-foreground">
                    取得した字幕の誤字修正と段落整形を Gemini
                    で行います。新規処理と「字幕を再校正」に適用されます。
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant={polishTranscript ? "default" : "outline"}
                    disabled={settingsLoading || settingsSaving}
                    onClick={() => void togglePolishTranscript()}
                  >
                    {settingsSaving
                      ? "保存中…"
                      : polishTranscript
                        ? "ON — 自動校正する"
                        : "OFF — 原文のまま"}
                  </Button>
                </div>
              ) : null}
              {geminiConfigured ? (
                <div className="flex flex-col gap-2">
                  <span className="font-medium">要約のカスタム指示</span>
                  <p className="text-muted-foreground">
                    要点生成時に AI へ追加する指示です。新規処理と「要約を再生成」に適用されます。
                    段落・改行・省略の指定は、既定の短い概要ルールより優先されます。
                    既存の要約には自動では入りません。保存後に再生成してください。
                  </p>
                  <Textarea
                    value={summaryCustomPromptDraft}
                    onChange={(e) => setSummaryCustomPromptDraft(e.target.value)}
                    placeholder={
                      "例: ビジネス視点で要約する / 専門用語は平易に / アクションは3件以内"
                    }
                    rows={5}
                    maxLength={summaryCustomPromptMaxLength}
                    disabled={settingsLoading || summaryPromptSaving}
                    className="min-h-28 text-sm"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {summaryCustomPromptDraft.length.toLocaleString("ja-JP")} /{" "}
                      {summaryCustomPromptMaxLength.toLocaleString("ja-JP")} 文字
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={summaryPromptDirty ? "default" : "outline"}
                      disabled={
                        settingsLoading ||
                        summaryPromptSaving ||
                        !summaryPromptDirty
                      }
                      onClick={() => void saveSummaryCustomPrompt()}
                    >
                      {summaryPromptSaving ? "保存中…" : "指示を保存"}
                    </Button>
                  </div>
                </div>
              ) : null}
              {geminiConfigured ? (
                <GeminiUsagePanel active={settingsOpen} />
              ) : null}
              {!geminiConfigured && (
                <p className="text-muted-foreground">
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Google AI Studio
                  </a>
                  {" "}
                  で無料 API キーを取得し、.env.local に GEMINI_API_KEY
                  を設定して開発サーバーを再起動してください。
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
