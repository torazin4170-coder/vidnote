"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { loadPaneLayout, savePaneLayout } from "@/lib/pane-layout";
import {
  buildVisualExplainerCopyText,
  type CopyPromptMode,
} from "@/lib/visual-explainer/copy-prompt";
import {
  formatLongVideoThresholdMinutes,
  recommendCursorDiagram,
} from "@/lib/visual-explainer/diagram-policy";
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
  const [splitRatio, setSplitRatio] = useState(0.42);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [notesCopyFeedback, setNotesCopyFeedback] = useState<string | null>(null);
  const [isImportingDiagram, setIsImportingDiagram] = useState(false);
  const [isGeneratingCritical, setIsGeneratingCritical] = useState(false);
  const [notesEditorKey, setNotesEditorKey] = useState(0);
  const [mobileSection, setMobileSection] = useState<"summary" | "notes">("summary");
  const containerRef = useRef<HTMLDivElement>(null);
  const diagramFileInputRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const splitRatioRef = useRef(splitRatio);

  useLayoutEffect(() => {
    setSplitRatio(loadPaneLayout().summaryNotesSplitRatio);
  }, []);

  useEffect(() => {
    splitRatioRef.current = splitRatio;
  }, [splitRatio]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    setSplitRatio(Math.min(0.7, Math.max(0.25, ratio)));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    savePaneLayout({ summaryNotesSplitRatio: splitRatioRef.current });
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
      ref={containerRef}
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

      {isMobile && (
        <div className={cn("shrink-0 px-4 py-3", mobileUi.segment)}>
          <button
            type="button"
            className={mobileUi.segmentItem(mobileSection === "summary")}
            onClick={() => setMobileSection("summary")}
          >
            AI 要点
          </button>
          <button
            type="button"
            className={mobileUi.segmentItem(mobileSection === "notes")}
            onClick={() => setMobileSection("notes")}
          >
            マイノート
          </button>
        </div>
      )}

      <div
        className={cn(
          "flex min-h-0 flex-col",
          isMobile && mobileSection !== "summary" && "max-md:hidden",
          isMobile ? "max-md:flex-1" : undefined,
        )}
        style={isMobile ? undefined : { flex: `${splitRatio} 1 0%` }}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 max-md:hidden md:flex">
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
          {copyFeedback && (
            <span className="text-xs text-muted-foreground">{copyFeedback}</span>
          )}
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className={cn("flex flex-col gap-3 p-3", mobileUi.paneBody, isMobile && "max-md:gap-4 max-md:p-4")}>
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
                minHeightClassName="min-h-[120px] max-md:min-h-[40vh]"
              />
            )}

            {summary && !bodiesReady && (
              <Skeleton className="h-[120px] w-full" />
            )}

            {summary && !hasVisualExplainer && !isGeneratingDiagram && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-medium">図解（任意）</p>
                {preferCursorDiagram ? (
                  <p className="text-muted-foreground">
                    {formatLongVideoThresholdMinutes()} 分以上の動画です。VidNote
                    内の図解はタイムアウトしやすいため、
                    <span className="font-medium text-foreground">
                      「Cursor 用にコピー」→ デスクトップの VidNote Diagram
                    </span>
                    を推奨します。
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    要点が出たら「Cursor 用にコピー」で図解を作成するか、短尺向けに
                    VidNote 内で生成できます（上部の「AI 図解」メニュー）。
                  </p>
                )}
                <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
                  <li>「Cursor 用にコピー」を押す</li>
                  <li>デスクトップの「VidNote Diagram」→ Composer に貼り付け</li>
                  <li>output/diagram.html に保存 → npm run diagram:preview で確認</li>
                  <li>「AI 図解」→「HTML を取り込む」から diagram.html を選ぶ</li>
                </ol>
              </div>
            )}

            {isGeneratingDiagram && (
              <p className="text-sm text-muted-foreground">
                Gemini が図解 HTML を生成しています…
              </p>
            )}

            {hasVisualExplainer && !isGeneratingDiagram && (
              <p className="text-sm text-muted-foreground">
                図解は「AI 図解」→「新しいタブで開く」から表示できます（
                {resolvedTheme === "dark" ? "ダーク" : "ライト"}
                モード）。
              </p>
            )}

            {session?.errorMessage && !isProcessing && summary && (
              <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="text-destructive">{session.errorMessage}</p>
                {!hasVisualExplainer && (
                  <p className="text-muted-foreground">
                    「Cursor 用にコピー」で Cursor または NotebookLM
                    に貼り付けて図解化できます。
                  </p>
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

      {!isMobile && (
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
      )}

      <div
        className={cn(
          "flex min-h-0 flex-col",
          isMobile && mobileSection !== "notes" && "max-md:hidden",
          isMobile ? "max-md:flex-1" : undefined,
        )}
        style={isMobile ? undefined : { flex: `${1 - splitRatio} 1 0%` }}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 max-md:hidden md:flex">
          <h2 className="text-sm font-medium">マイノート</h2>
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
          {notesCopyFeedback && (
            <span className="text-xs text-muted-foreground">{notesCopyFeedback}</span>
          )}
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
        </div>
        <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden p-3", isMobile && "max-md:p-4")}>
          {!session ? (
            <p className={cn("text-sm text-muted-foreground", mobileUi.paneBodyMuted)}>
              {isMobile
                ? "下部の「履歴」からセッションを選択してください。"
                : "左の一覧からセッションを選択してください。"}
            </p>
          ) : !bodiesReady ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <div className="min-h-0 flex-1">
              <NoteEditor
                key={`${session.id}-${notesEditorKey}`}
                initialContent={session.notesHtml ?? ""}
                onChange={onNotesChange}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
