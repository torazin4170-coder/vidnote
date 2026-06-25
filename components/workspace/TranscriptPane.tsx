"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Search, X } from "lucide-react";

import type { Session } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

type TranscriptPaneProps = {
  session: Session | null;
  isProcessing: boolean;
  width?: number;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-accent px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/** Legacy timestamp lines are normalized for display. */
function normalizeTranscript(raw: string): string {
  const lines = raw.split("\n");
  const paragraphs: string[] = [];
  let current = "";

  const stripTimestamp = (line: string) =>
    line.replace(/^\d{1,2}:\d{2}(:\d{2})?\s*/, "").trim();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) {
        paragraphs.push(current.trim());
        current = "";
      }
      continue;
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      continue;
    }
    const text = stripTimestamp(trimmed);
    if (!text) continue;
    current += current ? ` ${text}` : text;
  }

  if (current) paragraphs.push(current.trim());
  return paragraphs.join("\n\n");
}

export function TranscriptPane({
  session,
  isProcessing,
  width,
}: TranscriptPaneProps) {
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const displayText = useMemo(() => {
    if (!session?.transcript?.trim()) return "";
    return normalizeTranscript(session.transcript);
  }, [session?.transcript]);

  const charCount = displayText.length;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (e.ctrlKey && e.shiftKey && e.key === "C" && displayText) {
        void navigator.clipboard.writeText(displayText);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayText]);

  const paragraphs = useMemo(() => {
    if (!displayText) return [];
    const parts = displayText.split("\n\n").filter(Boolean);
    if (parts.length > 150) {
      return [displayText];
    }
    return parts;
  }, [displayText]);

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
            disabled={!displayText}
            onClick={() => {
              if (displayText) void navigator.clipboard.writeText(displayText);
            }}
            aria-label="全文コピー"
          >
            <Copy />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="w-full min-w-0 p-4">
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

          <div className="flex w-full min-w-0 flex-col gap-4">
            {paragraphs.map((paragraph, index) => (
              <p
                key={index}
                className="w-full text-sm leading-relaxed break-words"
              >
                {highlightText(paragraph, query)}
              </p>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
