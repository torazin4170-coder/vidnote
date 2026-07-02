"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Search, X } from "lucide-react";

import { RichTextEditor } from "@/components/editor/RichTextEditor";
import type { Session } from "@/lib/schema";
import {
  stripTranscriptFormatting,
  transcriptToEditorHtml,
} from "@/lib/rich-text/transcript-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type TranscriptPaneProps = {
  session: Session | null;
  isProcessing: boolean;
  width?: number;
  onChange?: (html: string) => void;
};

export function TranscriptPane({
  session,
  isProcessing,
  width,
  onChange,
}: TranscriptPaneProps) {
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const editorContent = useMemo(
    () => transcriptToEditorHtml(session?.transcript),
    [session?.transcript],
  );

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
      className="flex min-w-[280px] shrink-0 flex-col bg-canvas"
      style={width != null ? { width } : { flex: 1.4 }}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <h2 className="text-sm font-medium">文字起こし</h2>
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

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!session && (
          <p className="text-sm text-muted-foreground">
            左のサイドバーから「新規動画」を追加するか、セッションを選択してください。
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
          <RichTextEditor
            key={session!.id}
            initialContent={editorContent}
            onChange={onChange!}
            showFixedToolbar={false}
            showHistory={false}
            minHeightClassName="min-h-[320px]"
            editorClassName="border-0 bg-transparent px-0 py-0"
          />
        )}
      </div>
    </div>
  );
}
