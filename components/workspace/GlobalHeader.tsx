"use client";

import { Settings } from "lucide-react";

import type { Session, SessionStatus } from "@/lib/schema";
import type { FocusMode } from "@/lib/schema";
import { STATUS_LABELS } from "@/lib/labels";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  if (status === "fetching_captions" || status === "summarizing") {
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

        <Dialog>
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
          <DialogContent>
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
                  {" "}で無料 API キーを取得し、.env.local に GEMINI_API_KEY
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
