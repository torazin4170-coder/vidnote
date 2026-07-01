"use client";

import { ExternalLink, Loader2, RefreshCw } from "lucide-react";

import type { Session } from "@/lib/schema";
import { STATUS_LABELS, isProcessingStatus } from "@/lib/labels";
import { formatDuration, youtubeThumbnailUrl } from "@/lib/youtube/parse-url";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type SessionAction = "reprocess" | "repolish" | "resummarize";

type VideoInputPaneProps = {
  session: Session | null;
  draftUrl: string;
  isCreating: boolean;
  pendingAction: SessionAction | null;
  width?: number;
  geminiConfigured: boolean;
  onDraftUrlChange: (url: string) => void;
  onCreateSession: () => void;
  onReprocess: () => void;
  onResummarize: () => void;
  onRepolish: () => void;
};

const PIPELINE_STEPS = [
  { key: "url", label: "URL 入力" },
  { key: "captions", label: "字幕取得" },
  { key: "polish", label: "字幕校正" },
  { key: "summary", label: "要点生成" },
  { key: "diagram", label: "図解（任意）" },
  { key: "notes", label: "ノート" },
] as const;

function stepState(
  session: Session | null,
  step: (typeof PIPELINE_STEPS)[number]["key"],
  geminiConfigured: boolean,
): "done" | "active" | "pending" | "skipped" {
  if (!session) return step === "url" ? "active" : "pending";

  const { status } = session;
  if (step === "url") return "done";

  if (step === "captions") {
    if (status === "fetching_captions" || status === "pending") return "active";
    if (
      status === "polishing_transcript" ||
      status === "transcribed" ||
      status === "summarizing" ||
      status === "generating_diagram" ||
      status === "done" ||
      (status === "error" && session.transcript)
    ) {
      return "done";
    }
    if (status === "error" && !session.transcript) return "active";
  }

  if (step === "polish") {
    if (status === "polishing_transcript") return "active";
    if (
      status === "transcribed" ||
      status === "summarizing" ||
      status === "generating_diagram" ||
      status === "done" ||
      (status === "error" && session.transcript)
    ) {
      return session.transcriptRaw &&
        session.transcriptRaw !== session.transcript
        ? "done"
        : "skipped";
    }
    if (status === "fetching_captions" || status === "pending") {
      return "pending";
    }
  }

  if (step === "summary") {
    if (status === "summarizing") return "active";
    if (
      status === "generating_diagram" ||
      (status === "done" && session.summaryJson)
    ) {
      return "done";
    }
    if (status === "transcribed") return "active";
  }

  if (step === "diagram") {
    if (status === "generating_diagram") return "active";
    if (session.hasVisualExplainer) return "done";
    if (status === "done" && session.summaryJson) return "pending";
    if (status === "summarizing" || status === "transcribed") return "pending";
  }

  if (step === "notes") {
    if (session.notesHtml) return "done";
  }

  return "pending";
}

type ActionButtonProps = {
  action: SessionAction;
  pendingAction: SessionAction | null;
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  onClick: () => void;
};

function ActionButton({
  action,
  pendingAction,
  label,
  pendingLabel,
  disabled = false,
  onClick,
}: ActionButtonProps) {
  const pending = pendingAction === action;

  return (
    <Button
      type="button"
      variant={pending ? "secondary" : "outline"}
      size="sm"
      disabled={disabled || pendingAction != null}
      aria-busy={pending}
      onClick={onClick}
    >
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : (
        <RefreshCw />
      )}
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function VideoInputPane({
  session,
  draftUrl,
  isCreating,
  pendingAction,
  width = 300,
  geminiConfigured,
  onDraftUrlChange,
  onCreateSession,
  onReprocess,
  onResummarize,
  onRepolish,
}: VideoInputPaneProps) {
  const processing = session ? isProcessingStatus(session.status) : isCreating;
  const actionBusy = pendingAction != null;
  const thumbnailSrc =
    session?.youtubeId != null
      ? youtubeThumbnailUrl(session.youtubeId)
      : session?.thumbnailUrl;
  const progressValue =
    session?.status === "fetching_captions"
      ? 20
      : session?.status === "polishing_transcript"
        ? 40
        : session?.status === "summarizing"
          ? 65
          : session?.status === "generating_diagram"
            ? 85
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
              const state = stepState(session, step.key, geminiConfigured);
              const stateLabel =
                state === "done"
                  ? "●"
                  : state === "active"
                    ? "◐"
                    : state === "skipped"
                      ? "—"
                      : "○";
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
                      {stateLabel} {step.label}
                      {state === "skipped" ? "（OFF）" : ""}
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
                aria-label="処理の進捗"
              >
                <div
                  className={cn(
                    "h-full bg-primary transition-all",
                    actionBusy && "animate-pulse",
                  )}
                  style={{ width: `${progressValue}%` }}
                />
              </div>
            )}
            {actionBusy && pendingAction && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {pendingAction === "reprocess"
                  ? "字幕を再取得しています…"
                  : pendingAction === "repolish"
                    ? "字幕を校正しています…"
                    : "要点を再生成しています…"}
              </p>
            )}
          </div>

          {session?.errorMessage && (
            <p className="text-xs text-destructive">{session.errorMessage}</p>
          )}

          {session && (
            <div className="flex flex-col gap-2">
              <ActionButton
                action="reprocess"
                pendingAction={pendingAction}
                label="字幕を再取得"
                pendingLabel="再取得中…"
                disabled={processing && !actionBusy}
                onClick={onReprocess}
              />
              {geminiConfigured ? (
                <ActionButton
                  action="repolish"
                  pendingAction={pendingAction}
                  label="字幕を再校正"
                  pendingLabel="校正中…"
                  disabled={(processing && !actionBusy) || !session.transcript}
                  onClick={onRepolish}
                />
              ) : null}
              <ActionButton
                action="resummarize"
                pendingAction={pendingAction}
                label="要約を再生成"
                pendingLabel="生成中…"
                disabled={(processing && !actionBusy) || !session.transcript}
                onClick={onResummarize}
              />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
