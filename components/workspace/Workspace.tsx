"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FocusMode, Session } from "@/lib/schema";
import { isProcessingStatus } from "@/lib/labels";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/workspace/GlobalHeader";
import { PaneResizer } from "@/components/workspace/PaneResizer";
import { SessionLibraryPane } from "@/components/workspace/SessionLibraryPane";
import { SummaryNotesPane } from "@/components/workspace/SummaryNotesPane";
import { TranscriptPane } from "@/components/workspace/TranscriptPane";
import { VideoInputPane } from "@/components/workspace/VideoInputPane";

type WorkspaceProps = {
  initialSessions: Session[];
  geminiConfigured: boolean;
};

function clampWidth(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mergeSession(summary: Session, detail: Session | undefined): Session {
  return detail ? { ...summary, ...detail } : summary;
}

/** 一覧 API（transcript なし）の更新で本文を消さない */
function mergeSessionSummary(existing: Session, summary: Session): Session {
  return {
    ...existing,
    ...summary,
    transcript: existing.transcript,
    summaryJson: existing.summaryJson,
  };
}

export function Workspace({
  initialSessions,
  geminiConfigured,
}: WorkspaceProps) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [sessionDetails, setSessionDetails] = useState<Record<string, Session>>(
    {},
  );
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSessions[0]?.id ?? null,
  );
  const [draftUrl, setDraftUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>("all");
  const [isNewDraft, setIsNewDraft] = useState(initialSessions.length === 0);
  const [sourceWidth, setSourceWidth] = useState(300);
  const [transcriptWidth, setTranscriptWidth] = useState(520);
  const sessionDetailsRef = useRef(sessionDetails);
  sessionDetailsRef.current = sessionDetails;

  const selectedSummary =
    sessions.find((s) => s.id === selectedSessionId) ?? null;
  const selectedSession = selectedSummary
    ? mergeSession(selectedSummary, sessionDetails[selectedSummary.id])
    : null;

  const loadSessionDetail = useCallback(async (id: string, silent = false) => {
    if (!silent) setLoadingSessionId(id);
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { session: Session };
      setSessionDetails((prev) => ({ ...prev, [id]: data.session }));
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...data.session } : s)),
      );
    } finally {
      if (!silent) {
        setLoadingSessionId((current) => (current === id ? null : current));
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedSessionId || isNewDraft) return;
    const silent =
      sessionDetailsRef.current[selectedSessionId]?.transcript != null;
    void loadSessionDetail(selectedSessionId, silent);
  }, [selectedSessionId, isNewDraft, loadSessionDetail]);

  const refreshSessions = useCallback(async () => {
    const res = await fetch("/api/sessions");
    if (!res.ok) return;
    const data = (await res.json()) as { sessions: Session[] };
    setSessions((prev) =>
      data.sessions.map((summary) => {
        const existing = prev.find((s) => s.id === summary.id);
        return existing ? mergeSessionSummary(existing, summary) : summary;
      }),
    );
    setSessionDetails((prev) => {
      const next = { ...prev };
      for (const summary of data.sessions) {
        const existing = next[summary.id];
        if (existing) {
          next[summary.id] = mergeSessionSummary(existing, summary);
        }
      }
      return next;
    });
  }, []);

  const refreshSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) return;
    const data = (await res.json()) as { session: Session };
    setSessionDetails((prev) => ({ ...prev, [id]: data.session }));
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...data.session } : s)),
    );
  }, []);

  useEffect(() => {
    const hasProcessing = sessions.some((s) => isProcessingStatus(s.status));
    if (!hasProcessing) return;

    const timer = setInterval(() => {
      void refreshSessions();
      if (!selectedSessionId || isNewDraft) return;
      const selected = sessions.find((s) => s.id === selectedSessionId);
      if (selected && isProcessingStatus(selected.status)) {
        void refreshSession(selectedSessionId);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [sessions, refreshSessions, refreshSession, selectedSessionId, isNewDraft]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        setIsNewDraft(true);
        setSelectedSessionId(null);
        setDraftUrl("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleCreateSession = async () => {
    if (!draftUrl.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: draftUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました");

      const session = data.session as Session;
      setSessions((prev) => [session, ...prev]);
      setSelectedSessionId(session.id);
      setIsNewDraft(false);
      setDraftUrl("");
      void fetch(`/api/sessions/${session.id}/process`, { method: "POST" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "削除に失敗しました");
      return;
    }

    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (selectedSessionId === id) {
        setSelectedSessionId(next[0]?.id ?? null);
        setIsNewDraft(next.length === 0);
      }
      return next;
    });
    setSessionDetails((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleDeleteAllSessions = async () => {
    const res = await fetch("/api/sessions", { method: "DELETE" });
    if (!res.ok) {
      alert("履歴の削除に失敗しました");
      return;
    }

    setSessions([]);
    setSelectedSessionId(null);
    setIsNewDraft(true);
    setDraftUrl("");
  };

  const handleReprocess = async () => {
    if (!selectedSessionId) return;
    setSessionDetails((prev) => {
      const next = { ...prev };
      delete next[selectedSessionId];
      return next;
    });
    await fetch(`/api/sessions/${selectedSessionId}/process`, {
      method: "POST",
    });
    void refreshSessions();
    void refreshSession(selectedSessionId);
  };

  const handleResummarize = async () => {
    if (!selectedSessionId) return;
    await fetch(
      `/api/sessions/${selectedSessionId}/process?action=resummarize`,
      { method: "POST" },
    );
    void refreshSession(selectedSessionId);
  };

  const handleNotesChange = async (html: string) => {
    if (!selectedSessionId) return;
    if (html === (selectedSession?.notesHtml ?? "")) return;
    const res = await fetch(`/api/sessions/${selectedSessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notesHtml: html }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { session: Session };
    setSessionDetails((prev) => ({
      ...prev,
      [selectedSessionId]: {
        ...(prev[selectedSessionId] ?? selectedSummary ?? data.session),
        ...data.session,
      },
    }));
    setSessions((prev) =>
      prev.map((s) =>
        s.id === selectedSessionId
          ? { ...s, notesHtml: data.session.notesHtml, updatedAt: data.session.updatedAt }
          : s,
      ),
    );
  };

  const handleCopySection = async (text: string) => {
    if (!selectedSessionId) return;
    const existing = selectedSession?.notesHtml ?? "";
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const addition = `<p>${escaped.replace(/\n/g, "<br/>")}</p>`;
    const nextHtml = existing + addition;
    await handleNotesChange(nextHtml);
  };

  const showPane2 = focusMode === "all" && !isNewDraft;
  const showPane3 = focusMode === "all" || focusMode === "transcript";
  const showPane4 = focusMode === "all" || focusMode === "notes";

  const processing = selectedSession
    ? isProcessingStatus(selectedSession.status)
    : isCreating;
  const isLoadingDetail =
    selectedSessionId != null &&
    !isNewDraft &&
    loadingSessionId === selectedSessionId;

  return (
    <SidebarProvider
      defaultOpen
      className="h-screen min-w-[1280px] w-full overflow-hidden bg-background text-foreground"
    >
      <SessionLibraryPane
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={(id) => {
          setSelectedSessionId(id);
          setIsNewDraft(false);
        }}
        onNewSession={() => {
          setIsNewDraft(true);
          setSelectedSessionId(null);
          setDraftUrl("");
        }}
        onDeleteSession={handleDeleteSession}
        onDeleteAllSessions={handleDeleteAllSessions}
      />

      <SidebarInset className="flex min-w-0 flex-col bg-background">
        <GlobalHeader
          session={isNewDraft ? null : selectedSession}
          focusMode={focusMode}
          geminiConfigured={geminiConfigured}
          onFocusModeChange={setFocusMode}
        />

        <div className="flex min-h-0 flex-1">
          {(showPane2 || isNewDraft) && (
            <>
              <VideoInputPane
                session={isNewDraft ? null : selectedSession}
                draftUrl={draftUrl}
                isCreating={isCreating}
                width={sourceWidth}
                onDraftUrlChange={setDraftUrl}
                onCreateSession={handleCreateSession}
                onReprocess={handleReprocess}
                onResummarize={handleResummarize}
              />
              {(showPane3 || showPane4) && (
                <PaneResizer
                  onResize={(delta) =>
                    setSourceWidth((width) =>
                      clampWidth(width + delta, 220, 480),
                    )
                  }
                />
              )}
            </>
          )}

          {showPane3 && (
            <>
              <TranscriptPane
                session={isNewDraft ? null : selectedSession}
                isProcessing={processing || isLoadingDetail}
                width={transcriptWidth}
              />
              {showPane4 && (
                <PaneResizer
                  onResize={(delta) =>
                    setTranscriptWidth((width) =>
                      clampWidth(width + delta, 280, 900),
                    )
                  }
                />
              )}
            </>
          )}

          {showPane4 && (
            <SummaryNotesPane
              session={isNewDraft ? null : selectedSession}
              geminiConfigured={geminiConfigured}
              isProcessing={processing || isLoadingDetail}
              onNotesChange={handleNotesChange}
              onResummarize={handleResummarize}
              onCopySection={handleCopySection}
            />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
