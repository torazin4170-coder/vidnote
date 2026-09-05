"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCopy,
  ExternalLink,
  ImageIcon,
  RefreshCw,
  ScanSearch,
  Upload,
} from "lucide-react";

import type { Session } from "@/lib/schema";
import { buildSummaryDisplayHtml } from "@/lib/notes/summary-to-html";
import { htmlToPlainTranscript } from "@/lib/rich-text/transcript-content";
import {
  buildVisualExplainerCopyText,
  type CopyPromptMode,
} from "@/lib/visual-explainer/copy-prompt";
import { recommendCursorDiagram } from "@/lib/visual-explainer/diagram-policy";
import { openVisualExplainerInNewTab } from "@/lib/visual-explainer/open-tab";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { mobileUi } from "@/components/workspace/mobile/mobile-ui";
import { cn } from "@/lib/utils";

const RichTextEditor = dynamic(
  () =>
    import("@/components/editor/RichTextEditor").then((mod) => mod.RichTextEditor),
  { ssr: false, loading: () => <Skeleton className="h-[120px] w-full" /> },
);

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
  isMobile?: boolean;
  onNotesChange: (html: string) => void;
  onSummaryChange: (html: string) => void;
  onGenerateCriticalThinking: () => Promise<void>;
  onResummarize: () => void;
  onGenerateDiagram: () => void;
  onRediagram: () => void;
  onImportDiagram: (html: string) => Promise<void>;
};

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
  isMobile = false,
  onNotesChange,
  onSummaryChange,
  onGenerateCriticalThinking,
  onResummarize,
  onGenerateDiagram,
  onRediagram,
  onImportDiagram,
}: SummaryNotesPaneProps) {
  const { resolvedTheme } = useTheme();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [notesCopyFeedback, setNotesCopyFeedback] = useState<string | null>(null);
  const [isImportingDiagram, setIsImportingDiagram] = useState(false);
  const [isGeneratingCritical, setIsGeneratingCritical] = useState(false);
  const [notesEditorKey, setNotesEditorKey] = useState(0);
  const diagramFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!copyFeedback) return;
    const timer = window.setTimeout(() => setCopyFeedback(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  useEffect(() => {
    if (!notesCopyFeedback) return;
    const timer = window.setTimeout(() => setNotesCopyFeedback(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notesCopyFeedback]);

  const summary = session?.summaryJson ?? null;
  const summaryEditorContent = useMemo(() => {
    if (session?.summaryHtml?.trim()) return session.summaryHtml;
    if (summary) return buildSummaryDisplayHtml(summary);
    return "";
  }, [session?.summaryHtml, summary]);

  const isGeneratingDiagram = session?.status === "generating_diagram";
  const hasVisualExplainer = session?.hasVisualExplainer ?? false;
  const preferCursorDiagram = recommendCursorDiagram(session?.durationSec);
  const canGenerateDiagram =
    Boolean(summary) && geminiConfigured && !isProcessing;
  const canGenerateCritical =
    Boolean(session?.transcript?.trim()) &&
    geminiConfigured &&
    !isProcessing &&
    !isGeneratingCritical;

  const handleGenerateCriticalThinking = async () => {
    setIsGeneratingCritical(true);
    try {
      await onGenerateCriticalThinking();
      setNotesEditorKey((key) => key + 1);
      setNotesCopyFeedback("批判的視点をマイノートに追加しました");
    } catch (err) {
      setNotesCopyFeedback(
        err instanceof Error ? err.message : "批判的視点の生成に失敗しました",
      );
    } finally {
      setIsGeneratingCritical(false);
    }
  };

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
    if (!summary || !session?.id) return;
    const text = buildVisualExplainerCopyText({
      title: session.title?.trim() || session.youtubeUrl || "",
      summary,
      transcript: session.transcript,
      notesHtml: session.notesHtml,
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

  const handleCopyNotes = async () => {
    const plain = htmlToPlainTranscript(session?.notesHtml ?? "").trim();
    if (!plain) {
      setNotesCopyFeedback("コピーするノートがありません");
      return;
    }
    const ok = await copyToClipboard(plain);
    setNotesCopyFeedback(
      ok ? "マイノートをコピーしました" : "クリップボードへのコピーに失敗しました",
    );
  };

  const handleImportDiagramFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImportingDiagram(true);
    try {
      const html = await file.text();
      await onImportDiagram(html);
      setCopyFeedback(
        "図解 HTML を VidNote に取り込みました。「AI 図解」→「新しいタブで開く」で表示できます。",
      );
    } catch (err) {
      setCopyFeedback(
        err instanceof Error ? err.message : "図解の取り込みに失敗しました",
      );
    } finally {
      setIsImportingDiagram(false);
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 w-full flex-1 flex-col bg-background md:min-w-[300px] md:border-l md:border-border",
        isMobile && "max-md:flex-1",
      )}
    >
      <input
        ref={diagramFileInputRef}
        type="file"
        accept=".html,text/html"
        className="hidden"
        onChange={(event) => void handleImportDiagramFile(event)}
      />

      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-medium">AI 要点 / マイノート</h2>
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant={preferCursorDiagram ? "default" : "ghost"}
                size="sm"
                disabled={!summary}
              >
                <ClipboardCopy />
                Cursor 用にコピー
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant={hasVisualExplainer ? "default" : "ghost"}
                size="sm"
                disabled={!summary || isGeneratingDiagram}
              >
                <ImageIcon />
                AI 図解
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {hasVisualExplainer && !isGeneratingDiagram && (
              <DropdownMenuItem onClick={handleOpenDiagramTab}>
                <ExternalLink />
                新しいタブで開く
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={isImportingDiagram}
              onClick={() => diagramFileInputRef.current?.click()}
            >
              <Upload />
              {hasVisualExplainer ? "HTML を再取り込み" : "HTML を取り込む"}
            </DropdownMenuItem>
            {!preferCursorDiagram && !hasVisualExplainer && (
              <DropdownMenuItem
                disabled={!canGenerateDiagram}
                onClick={onGenerateDiagram}
              >
                <ImageIcon />
                VidNote 内で図解を生成
              </DropdownMenuItem>
            )}
            {hasVisualExplainer && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!canGenerateDiagram}
                  onClick={onRediagram}
                >
                  <RefreshCw />
                  図解を再生成
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canGenerateCritical}
          onClick={() => void handleGenerateCriticalThinking()}
        >
          <ScanSearch />
          {isGeneratingCritical ? "分析中…" : "批判的視点"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          disabled={!session?.notesHtml?.trim() || !bodiesReady}
          onClick={() => void handleCopyNotes()}
          aria-label="マイノートを全文コピー"
        >
          <ClipboardCopy />
        </Button>
        {(copyFeedback || notesCopyFeedback) && (
          <span className="w-full text-xs text-muted-foreground md:w-auto">
            {copyFeedback ?? notesCopyFeedback}
          </span>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div
          className={cn(
            "flex flex-col gap-6 p-3",
            mobileUi.paneBody,
            isMobile && "max-md:gap-8 max-md:p-4",
          )}
        >
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI 要点
            </h3>

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

            {summary && bodiesReady && (
              <RichTextEditor
                key={session?.id}
                initialContent={summaryEditorContent || "<p></p>"}
                onChange={onSummaryChange}
                showFixedToolbar
                showHistory
                className="vidnote-mobile-editor"
                minHeightClassName="min-h-[120px] max-md:min-h-[30vh]"
              />
            )}

            {summary && !bodiesReady && (
              <Skeleton className="h-[120px] w-full" />
            )}

            {isGeneratingDiagram && (
              <p className="text-sm text-muted-foreground">
                Gemini が図解 HTML を生成しています…
              </p>
            )}

            {session?.errorMessage && !isProcessing && summary && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {session.errorMessage}
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
          </section>

          <section className="flex flex-col gap-3 border-t border-border pt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              マイノート
            </h3>

            {!session ? (
              <p className={cn("text-sm text-muted-foreground", mobileUi.paneBodyMuted)}>
                {isMobile
                  ? "下部の「履歴」からセッションを選択してください。"
                  : "左の一覧からセッションを選択してください。"}
              </p>
            ) : !bodiesReady ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <NoteEditor
                key={`${session.id}-${notesEditorKey}`}
                initialContent={session.notesHtml ?? ""}
                onChange={onNotesChange}
              />
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
