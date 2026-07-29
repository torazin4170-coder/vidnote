"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Search, X } from "lucide-react";

import { PlainTranscriptEditor } from "@/components/editor/PlainTranscriptEditor";
import type { Session } from "@/lib/schema";
import { stripTranscriptFormatting } from "@/lib/rich-text/transcript-content";
import { mobileUi } from "@/components/workspace/mobile/mobile-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type TranscriptPaneProps = {
  session: Session | null;
  isProcessing: boolean;
  width?: number;
  isMobile?: boolean;
  onChange?: (plainText: string) => void;
};

export function TranscriptPane({
  session,
  isProcessing,
  width,
  isMobile = false,
  onChange,
}: TranscriptPaneProps) {
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const plainText = useMemo(
    () => stripTranscriptFormatting(session?.transcript ?? ""),
    [session?.transcript],
  );

  const matchCount = useMemo(() => {
    const q = query.trim();
    if (!q || !plainText) return 0;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return [...plainText.matchAll(re)].length;
  }, [plainText, query]);

  const charCount = plainText.length;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (e.ctrlKey && e.shiftKey && e.key === "C" && plainText) {
        void navigator.clipboard.writeText(plainText);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [plainText]);

  const canEdit = Boolean(session?.transcript?.trim()) && Boolean(onChange);

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 w-full flex-1 flex-col bg-canvas md:min-w-[280px] md:shrink-0 md:flex-none",
      )}
      style={!isMobile && width != null ? { width } : undefined}
    >
      <div className={cn("flex h-10 shrink-0 items-center gap-2 border-b border-border px-3", mobileUi.paneHeader, isMobile && "max-md:border-b")}>
        <h2 className="text-sm font-medium max-md:text-base max-md:font-semibold">文字起こし</h2>
        {charCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {charCount.toLocaleString()} 文字
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {showSearch ? (
            <div className="flex items-center gap-1">
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="検索…"
                className="h-7 w-40 bg-card"
                aria-label="字幕内検索"
              />
              {query.trim() && (
                <span className="text-xs text-muted-foreground">
                  {matchCount} 件
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setShowSearch(false);
                  setQuery("");
                }}
                aria-label="検索を閉じる"
              >
                <X />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowSearch(true)}
              aria-label="検索"
            >
              <Search />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!plainText}
            onClick={() => {
              if (plainText) void navigator.clipboard.writeText(plainText);
            }}
            aria-label="全文コピー"
          >
            <Copy />
          </Button>
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-auto p-4", isMobile && "max-md:p-4")}>
        {!session && (
          <p className="text-sm text-muted-foreground">
            {isMobile
              ? "上部のメニューから履歴を開き、セッションを選択してください。"
              : "左のサイドバーから「新規動画」を追加するか、セッションを選択してください。"}
          </p>
        )}

        {session && isProcessing && !session.transcript && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        )}

        {session && !session.transcript && !isProcessing && (
          <p className="text-sm text-muted-foreground">
            字幕が未取得です。「処理を開始」または「字幕を再取得」を実行してください。
          </p>
        )}

        {canEdit && (
          <div className="flex h-full min-h-0 flex-col gap-2">
            {!isMobile && (
            <p className="text-xs text-muted-foreground">
              装飾・整理は右の「マイノート」へコピーして編集してください。
            </p>
            )}
            <PlainTranscriptEditor
              sessionId={session!.id}
              initialPlainText={plainText}
              onChange={onChange!}
              className={cn("min-h-0 flex-1", isMobile && "vidnote-mobile-transcript max-md:min-h-[50vh] max-md:text-[1.0625rem] max-md:leading-[1.75] max-md:px-4 max-md:py-3")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
