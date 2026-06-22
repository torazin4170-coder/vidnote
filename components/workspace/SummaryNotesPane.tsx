"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, RefreshCw } from "lucide-react";

import type { Session, SummarySections } from "@/lib/schema";
import { SUMMARY_SECTION_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

const NoteEditor = dynamic(
  () =>
    import("@/components/editor/NoteEditor").then((mod) => mod.NoteEditor),
  { ssr: false, loading: () => <Skeleton className="h-[200px] w-full" /> },
);

type SummaryNotesPaneProps = {
  session: Session | null;
  geminiConfigured: boolean;
  isProcessing: boolean;
  onNotesChange: (html: string) => void;
  onResummarize: () => void;
  onCopySection: (text: string) => void;
};

function sectionToText(
  key: keyof typeof SUMMARY_SECTION_LABELS,
  summary: SummarySections,
): string {
  if (key === "overview") return summary.overview;
  if (key === "keyPoints") return summary.keyPoints.map((p) => `• ${p}`).join("\n");
  if (key === "terms") {
    return summary.terms.map((t) => `• ${t.term}: ${t.definition}`).join("\n");
  }
  return summary.actions.map((a) => `• ${a}`).join("\n");
}

export function SummaryNotesPane({
  session,
  geminiConfigured,
  isProcessing,
  onNotesChange,
  onResummarize,
  onCopySection,
}: SummaryNotesPaneProps) {
  const [splitRatio, setSplitRatio] = useState(0.42);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    setSplitRatio(Math.min(0.7, Math.max(0.25, ratio)));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const summary = session?.summaryJson ?? null;

  return (
    <div
      ref={containerRef}
      className="flex min-w-[300px] flex-1 flex-col border-l border-border bg-background"
    >
      <div
        className="flex min-h-0 flex-col"
        style={{ flex: `${splitRatio} 1 0%` }}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <h2 className="text-sm font-medium">AI 要点</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResummarize}
            disabled={!session?.transcript || isProcessing || !geminiConfigured}
          >
            <RefreshCw />
            再生成
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-3">
            {!geminiConfigured && (
              <p className="text-sm text-muted-foreground">
                GEMINI_API_KEY 未設定のため、字幕取得のみ利用できます。
              </p>
            )}

            {session && isProcessing && session.status === "summarizing" && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}

            {summary &&
              (
                Object.keys(SUMMARY_SECTION_LABELS) as Array<
                  keyof typeof SUMMARY_SECTION_LABELS
                >
              ).map((key) => (
                <Collapsible key={key} defaultOpen>
                  <div className="flex items-center justify-between gap-2">
                    <CollapsibleTrigger className="text-sm font-medium">
                      ▼ {SUMMARY_SECTION_LABELS[key]}
                    </CollapsibleTrigger>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        onCopySection(sectionToText(key, summary))
                      }
                    >
                      <ArrowDownToLine />
                      ノートへ
                    </Button>
                  </div>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-lg border border-border bg-card p-3 text-sm leading-relaxed">
                      {key === "overview" && <p>{summary.overview}</p>}
                      {key === "keyPoints" && (
                        <ul className="flex flex-col gap-1">
                          {summary.keyPoints.map((point, i) => (
                            <li key={i}>• {point}</li>
                          ))}
                        </ul>
                      )}
                      {key === "terms" && (
                        <ul className="flex flex-col gap-2">
                          {summary.terms.map((term, i) => (
                            <li key={i}>
                              <span className="font-medium">{term.term}</span>
                              {" — "}
                              {term.definition}
                            </li>
                          ))}
                        </ul>
                      )}
                      {key === "actions" && (
                        <ul className="flex flex-col gap-1">
                          {summary.actions.map((action, i) => (
                            <li key={i}>• {action}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}

            {session?.transcript &&
              !summary &&
              !isProcessing &&
              geminiConfigured && (
                <p className="text-sm text-muted-foreground">
                  要約がありません。「要約を再生成」を実行してください。
                </p>
              )}
          </div>
        </ScrollArea>
      </div>

      <div
        className="flex h-2 shrink-0 cursor-row-resize items-center justify-center border-y border-border bg-muted/50"
        onMouseDown={() => {
          dragging.current = true;
        }}
        role="separator"
        aria-orientation="horizontal"
        aria-label="要点とノートの境界"
      >
        <span className="text-[10px] text-muted-foreground">↕</span>
      </div>

      <div
        className="flex min-h-0 flex-col"
        style={{ flex: `${1 - splitRatio} 1 0%` }}
      >
        <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
          <h2 className="text-sm font-medium">マイノート</h2>
        </div>
        <div className="min-h-0 flex-1 p-3">
          <NoteEditor
            key={session?.id ?? "empty"}
            initialContent={session?.notesHtml ?? ""}
            onChange={onNotesChange}
          />
        </div>
      </div>
    </div>
  );
}
