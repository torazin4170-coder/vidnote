"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ClipboardCopy,
  ExternalLink,
  ImageIcon,
  Loader2,
  RefreshCw,
} from "lucide-react";

import type { Session, SummarySections } from "@/lib/schema";
import { SUMMARY_SECTION_LABELS } from "@/lib/labels";
import {
  buildVisualExplainerCopyText,
  type CopyPromptMode,
} from "@/lib/visual-explainer/copy-prompt";
import { openVisualExplainerInNewTab } from "@/lib/visual-explainer/open-tab";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

const NoteEditor = dynamic(
  () =>
    import("@/components/editor/NoteEditor").then((mod) => mod.NoteEditor),
  { ssr: false, loading: () => <Skeleton className="h-[200px] w-full" /> },
);

type SummaryNotesPaneProps = {
  session: Session | null;
  bodiesReady: boolean;
  geminiConfigured: boolean;
  isProcessing: boolean;
  onNotesChange: (html: string) => void;
  onResummarize: () => void;
  onGenerateDiagram: () => void;
  onRediagram: () => void;
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

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SummaryNotesPane({
  session,
  bodiesReady,
  geminiConfigured,
  isProcessing,
  onNotesChange,
  onResummarize,
  onGenerateDiagram,
  onRediagram,
  onCopySection,
}: SummaryNotesPaneProps) {
  const { resolvedTheme } = useTheme();
  const [splitRatio, setSplitRatio] = useState(0.42);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
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

  useEffect(() => {
    if (!copyFeedback) return;
    const timer = window.setTimeout(() => setCopyFeedback(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  const summary = session?.summaryJson ?? null;
  const isGeneratingDiagram = session?.status === "generating_diagram";
  const hasVisualExplainer = session?.hasVisualExplainer ?? false;
  const canGenerateDiagram =
    Boolean(summary) && geminiConfigured && !isProcessing;

  const handleOpenDiagramTab = () => {
    if (!session?.id || !hasVisualExplainer) return;
    const opened = openVisualExplainerInNewTab(session.id, resolvedTheme);
    if (!opened) {
      setCopyFeedback(
        "ポップアップがブロックされました。ブラウザの設定を確認してください。",
      );
    }
  };

  const handleCopyForExternal = async (mode: CopyPromptMode) => {
    if (!summary) return;
    const text = buildVisualExplainerCopyText({
      title: session?.title?.trim() || session?.youtubeUrl || "",
      summary,
      transcript: session?.transcript,
      mode,
    });
    const ok = await copyToClipboard(text);
    setCopyFeedback(
      ok
        ? mode === "cursor"
          ? "Cursor 用プロンプトをコピーしました"
          : "NotebookLM 用テキストをコピーしました"
        : "クリップボードへのコピーに失敗しました",
    );
  };

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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onGenerateDiagram}
            disabled={!canGenerateDiagram}
          >
            {isGeneratingDiagram ? <Loader2 className="animate-spin" /> : <ImageIcon />}
            {isGeneratingDiagram ? "図解生成中" : "図解を生成"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!summary}
                >
                  <ClipboardCopy />
                  図解用にコピー
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => void handleCopyForExternal("cursor")}>
                Cursor / 図解ツール向け
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleCopyForExternal("notebooklm")}>
                NotebookLM 向け（要点のみ）
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {copyFeedback && (
            <span className="text-xs text-muted-foreground">{copyFeedback}</span>
          )}
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

            {(isGeneratingDiagram || hasVisualExplainer) && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">AI 図解</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {hasVisualExplainer && !isGeneratingDiagram && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={handleOpenDiagramTab}
                      >
                        <ExternalLink />
                        新しいタブで開く
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={onRediagram}
                      disabled={!canGenerateDiagram}
                    >
                      <RefreshCw />
                      図解を再生成
                    </Button>
                  </div>
                </div>
                {isGeneratingDiagram && (
                  <p className="text-sm text-muted-foreground">
                    Gemini が図解 HTML を生成しています。完了すると新しいタブで開きます…
                  </p>
                )}
                {hasVisualExplainer && !isGeneratingDiagram && (
                  <p className="text-sm text-muted-foreground">
                    図解は新しいタブで表示されます（
                    {resolvedTheme === "dark" ? "ダーク" : "ライト"}
                    モード）。
                  </p>
                )}
              </div>
            )}

            {session?.errorMessage && !isProcessing && summary && (
              <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="text-destructive">{session.errorMessage}</p>
                {!hasVisualExplainer && (
                  <>
                    <p className="text-muted-foreground">
                      自動生成に失敗した場合は「図解用にコピー」で Cursor または
                      NotebookLM に貼り付けて図解化できます。
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => void handleCopyForExternal("cursor")}
                      >
                        <ClipboardCopy />
                        Cursor 用にコピー
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={onRediagram}
                        disabled={!canGenerateDiagram}
                      >
                        <RefreshCw />
                        再試行
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {session?.transcript &&
              !summary &&
              !isProcessing &&
              geminiConfigured && (
                <p className="text-sm text-muted-foreground">
                  要約がありません。「再生成」を実行してください。
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
          {!session ? (
            <p className="text-sm text-muted-foreground">
              左の一覧からセッションを選択してください。
            </p>
          ) : !bodiesReady ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <NoteEditor
              key={session.id}
              initialContent={session.notesHtml ?? ""}
              onChange={onNotesChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
