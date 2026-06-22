"use client";

import { ExternalLink, RefreshCw } from "lucide-react";

import type { Session } from "@/lib/schema";
import { STATUS_LABELS, isProcessingStatus } from "@/lib/labels";
import { formatDuration, youtubeThumbnailUrl } from "@/lib/youtube/parse-url";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type VideoInputPaneProps = {
  session: Session | null;
  draftUrl: string;
  isCreating: boolean;
  width?: number;
  onDraftUrlChange: (url: string) => void;
  onCreateSession: () => void;
  onReprocess: () => void;
  onResummarize: () => void;
};

const PIPELINE_STEPS = [
  { key: "url", label: "URL 入力" },
  { key: "captions", label: "字幕取得" },
  { key: "summary", label: "要点生成" },
  { key: "notes", label: "ノート" },
] as const;

function stepState(
  session: Session | null,
  step: (typeof PIPELINE_STEPS)[number]["key"],
): "done" | "active" | "pending" {
  if (!session) return step === "url" ? "active" : "pending";

  const { status } = session;
  if (step === "url") return "done";
  if (step === "captions") {
    if (status === "fetching_captions" || status === "pending") return "active";
    if (
      status === "transcribed" ||
      status === "summarizing" ||
      status === "done" ||
      status === "error"
    ) {
      return status === "error" && !session.transcript ? "active" : "done";
    }
  }
  if (step === "summary") {
    if (status === "summarizing") return "active";
    if (status === "done" && session.summaryJson) return "done";
    if (status === "transcribed") return "active";
  }
  if (step === "notes") {
    if (session.notesHtml) return "done";
  }
  return "pending";
}

export function VideoInputPane({
  session,
  draftUrl,
  isCreating,
  width = 300,
  onDraftUrlChange,
  onCreateSession,
  onReprocess,
  onResummarize,
}: VideoInputPaneProps) {
  const processing = session ? isProcessingStatus(session.status) : isCreating;
  const thumbnailSrc =
    session?.youtubeId != null
      ? youtubeThumbnailUrl(session.youtubeId)
      : session?.thumbnailUrl;
  const progressValue =
    session?.status === "fetching_captions"
      ? 35
      : session?.status === "summarizing"
        ? 75
        : session?.status === "done"
          ? 100
          : session?.status === "transcribed"
            ? 50
            : 10;

  return (
    <div
      className="flex min-w-[220px] shrink-0 flex-col border-r border-border bg-background"
      style={{ width }}
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <h2 className="text-sm font-medium">ソース</h2>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {thumbnailSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailSrc}
              alt=""
              className="aspect-video w-full rounded-md border border-border object-cover"
            />
          )}

          <div className="flex flex-col gap-1">
            <p className="line-clamp-2 text-sm font-medium">
              {session?.title ?? "新しい動画"}
            </p>
            {session && (
              <p className="text-xs text-muted-foreground">
                {formatDuration(session.durationSec)}
              </p>
            )}
          </div>

          {!session && (
            <div className="flex flex-col gap-2">
              <Input
                value={draftUrl}
                onChange={(e) => onDraftUrlChange(e.target.value)}
                placeholder="YouTube URL を貼り付け"
                aria-label="YouTube URL"
                className="h-8 bg-card"
              />
              <Button
                type="button"
                onClick={onCreateSession}
                disabled={!draftUrl.trim() || isCreating}
              >
                {isCreating ? "作成中…" : "処理を開始"}
              </Button>
            </div>
          )}

          {session && (
            <div className="flex flex-col gap-2">
              <p className="break-all text-xs text-muted-foreground">
                {session.youtubeUrl}
              </p>
              <a
                href={session.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "inline-flex gap-1",
                )}
              >
                <ExternalLink />
                YouTube で開く
              </a>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              処理パイプライン
            </p>
            {PIPELINE_STEPS.map((step, index) => {
              const state = stepState(session, step.key);
              return (
                <div key={step.key} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={
                        state === "done"
                          ? "text-primary"
                          : state === "active"
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }
                    >
                      {state === "done" ? "●" : state === "active" ? "◐" : "○"}{" "}
                      {step.label}
                    </span>
                    {session && state === "active" && (
                      <Badge variant="secondary">
                        {STATUS_LABELS[session.status]}
                      </Badge>
                    )}
                  </div>
                  {index < PIPELINE_STEPS.length - 1 && (
                    <span className="ml-1 text-muted-foreground">│</span>
                  )}
                </div>
              );
            })}
            {processing && (
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={progressValue}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
            )}
          </div>

          {session?.errorMessage && (
            <p className="text-xs text-destructive">{session.errorMessage}</p>
          )}

          {session && (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReprocess}
                disabled={processing}
              >
                <RefreshCw />
                字幕を再取得
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onResummarize}
                disabled={processing || !session.transcript}
              >
                <RefreshCw />
                要約を再生成
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
