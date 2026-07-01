"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import type { Category, CategoryFilter, FocusMode, Session, SessionStatus } from "@/lib/schema";
import { isProcessingStatus } from "@/lib/labels";
import { toSessionListPatch } from "@/lib/session-list";
import { normalizeYoutubeUrl, youtubeWatchUrl } from "@/lib/youtube/parse-url";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/workspace/GlobalHeader";
import { useTheme } from "@/components/theme-provider";
import {
  closeVisualExplainerTab,
  navigateVisualExplainerTab,
  openVisualExplainerInNewTab,
  prepareVisualExplainerTab,
} from "@/lib/visual-explainer/open-tab";
import { PaneResizer } from "@/components/workspace/PaneResizer";
import { SessionLibraryPane } from "@/components/workspace/SessionLibraryPane";
import { SummaryNotesPane } from "@/components/workspace/SummaryNotesPane";
import { TranscriptPane } from "@/components/workspace/TranscriptPane";
import {
  VideoInputPane,
  type SessionAction,
} from "@/components/workspace/VideoInputPane";

type WorkspaceProps = {
  initialSessions: Session[];
  initialCategories: Category[];
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
    transcriptRaw: existing.transcriptRaw,
    transcript: existing.transcript,
    summaryJson: existing.summaryJson,
    notesHtml: existing.notesHtml,
    hasVisualExplainer:
      summary.hasVisualExplainer || existing.hasVisualExplainer,
  };
}

function preserveSessionBodies(existing: Session | undefined, meta: Session): Session {
  if (!existing) return meta;
  return {
    ...meta,
    transcriptRaw: existing.transcriptRaw,
    transcript: existing.transcript,
    summaryJson: existing.summaryJson,
    notesHtml: existing.notesHtml,
  };
}

type SessionBodiesResponse = {
  transcriptRaw: string | null;
  transcript: string | null;
  summaryJson: Session["summaryJson"];
  notesHtml: string | null;
};

async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<{ res: Response; data: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(input, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      "サーバーとの通信に失敗しました。ページを再読み込み（Ctrl+Shift+R）してから再試行してください。",
    );
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new Error(`サーバー応答の解析に失敗しました（HTTP ${res.status}）`);
  }

  return { res, data };
}

export function Workspace({
  initialSessions,
  initialCategories,
  geminiConfigured,
}: WorkspaceProps) {
  const { resolvedTheme } = useTheme();
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Session[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sessionDetails, setSessionDetails] = useState<Record<string, Session>>(
    {},
  );
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [bodiesLoadedIds, setBodiesLoadedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [draftUrl, setDraftUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<SessionAction | null>(null);
  const [focusMode, setFocusMode] = useState<FocusMode>("all");
  const [isNewDraft, setIsNewDraft] = useState(initialSessions.length === 0);
  const [libraryWidth, setLibraryWidth] = useState(256);
  const [sourceWidth, setSourceWidth] = useState(300);
  const [transcriptWidth, setTranscriptWidth] = useState(520);
  const sessionDetailsRef = useRef(sessionDetails);
  const sessionsRef = useRef(sessions);
  const listSessionsRef = useRef<Session[]>(initialSessions);
  const pendingDiagramOpenRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session")?.trim();
    if (!sessionId) return;

    setSelectedSessionId(sessionId);
    setIsNewDraft(false);
    if (params.get("open") === "diagram") {
      pendingDiagramOpenRef.current = true;
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    sessionDetailsRef.current = sessionDetails;
  }, [sessionDetails]);

  useEffect(() => {
    sessionsRef.current = sessions;
    listSessionsRef.current = searchResults ?? sessions;
  }, [sessions, searchResults]);

  const loadSessionBodies = useCallback(async (id: string) => {
    const res = await fetch(`/api/sessions/${id}/bodies`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { bodies: SessionBodiesResponse };
    setSessionDetails((prev) => {
      const base = prev[id] ?? sessionsRef.current.find((s) => s.id === id);
      if (!base) return prev;
      return {
        ...prev,
        [id]: {
          ...base,
          transcriptRaw: data.bodies.transcriptRaw,
          transcript: data.bodies.transcript,
          summaryJson: data.bodies.summaryJson,
          notesHtml: data.bodies.notesHtml,
        },
      };
    });
    setBodiesLoadedIds((prev) => new Set(prev).add(id));
  }, []);

  const loadSessionMeta = useCallback(async (id: string) => {
    const prevStatus = sessionDetailsRef.current[id]?.status;
    const res = await fetch(`/api/sessions/${id}`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { session: Session };
    setSessionDetails((prev) => ({
      ...prev,
      [id]: preserveSessionBodies(prev[id], data.session),
    }));
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, ...toSessionListPatch(data.session) } : s,
      ),
    );
    if (
      prevStatus &&
      isProcessingStatus(prevStatus) &&
      !isProcessingStatus(data.session.status)
    ) {
      void loadSessionBodies(id);
    }
    return data.session;
  }, [loadSessionBodies]);

  const refreshSessionMeta = useCallback(async (id: string) => {
    await loadSessionMeta(id);
  }, [loadSessionMeta]);

  const reloadSessionBodies = useCallback(
    async (id: string) => {
      if (!bodiesLoadedIds.has(id)) return;
      await loadSessionBodies(id);
    },
    [bodiesLoadedIds, loadSessionBodies],
  );

  const loadSelectedSession = useCallback(
    async (id: string) => {
      setLoadingSessionId(id);
      setBodiesLoadedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      try {
        await loadSessionMeta(id);
        const schedule =
          typeof window.requestIdleCallback === "function"
            ? window.requestIdleCallback.bind(window)
            : (cb: IdleRequestCallback) =>
                window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 50);
        schedule(() => {
          void loadSessionBodies(id).finally(() => {
            setLoadingSessionId((current) => (current === id ? null : current));
          });
        });
      } catch {
        setLoadingSessionId((current) => (current === id ? null : current));
      }
    },
    [loadSessionMeta, loadSessionBodies],
  );

  const selectedSummary =
    sessions.find((s) => s.id === selectedSessionId) ?? null;
  const selectedSession = selectedSummary
    ? mergeSession(selectedSummary, sessionDetails[selectedSummary.id])
    : null;

  const applyOptimisticStatus = useCallback((id: string, status: SessionStatus) => {
    const patch = { status, errorMessage: null };
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
    setSessionDetails((prev) => {
      const existing = prev[id];
      if (existing) {
        return { ...prev, [id]: { ...existing, ...patch } };
      }
      const summary = sessionsRef.current.find((s) => s.id === id);
      if (!summary) return prev;
      return { ...prev, [id]: { ...summary, ...patch } };
    });
  }, []);

  useEffect(() => {
    if (!selectedSessionId || isNewDraft) return;
    void loadSelectedSession(selectedSessionId);
  }, [selectedSessionId, isNewDraft, loadSelectedSession]);

  const refreshSessions = useCallback(async (search?: string) => {
    const params = new URLSearchParams();
    const q = search?.trim();
    if (q) params.set("search", q);
    const url = params.size > 0 ? `/api/sessions?${params}` : "/api/sessions";
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { sessions: Session[] };
    const mergeList = (prev: Session[]) =>
      data.sessions.map((summary) => {
        const existing = prev.find((s) => s.id === summary.id);
        return existing ? mergeSessionSummary(existing, summary) : summary;
      });

    if (q) {
      setSearchResults((prev) => mergeList(prev ?? sessionsRef.current));
      const byId = new Map(data.sessions.map((s) => [s.id, s]));
      setSessions((prev) =>
        prev.map((s) => {
          const updated = byId.get(s.id);
          return updated ? mergeSessionSummary(s, updated) : s;
        }),
      );
    } else {
      setSessions((prev) => mergeList(prev));
    }
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

  const refreshSession = useCallback(
    async (id: string) => {
      await refreshSessionMeta(id);
      if (bodiesLoadedIds.has(id)) {
        await reloadSessionBodies(id);
      }
    },
    [bodiesLoadedIds, refreshSessionMeta, reloadSessionBodies],
  );

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/sessions?search=${encodeURIComponent(q)}`,
            { credentials: "include" },
          );
          if (!res.ok) return;
          const data = (await res.json()) as { sessions: Session[] };
          setSearchResults(
            data.sessions.map((summary) => {
              const existing = sessionsRef.current.find(
                (s) => s.id === summary.id,
              );
              return existing
                ? mergeSessionSummary(existing, summary)
                : summary;
            }),
          );
        } finally {
          setIsSearching(false);
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const listSessions = searchResults ?? sessions;
  const hasProcessingSessions = listSessions.some((s) =>
    isProcessingStatus(s.status),
  );

  useEffect(() => {
    if (!hasProcessingSessions) return;

    const timer = setInterval(() => {
      void fetch("/api/jobs/drain", { method: "POST", credentials: "include" });
      void refreshSessions(searchQuery.trim() || undefined);
      if (!selectedSessionId || isNewDraft) return;
      const selected = listSessionsRef.current.find(
        (s) => s.id === selectedSessionId,
      );
      if (selected && isProcessingStatus(selected.status)) {
        void refreshSessionMeta(selectedSessionId);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [
    hasProcessingSessions,
    refreshSessions,
    refreshSessionMeta,
    selectedSessionId,
    isNewDraft,
    searchQuery,
  ]);

  useEffect(() => {
    if (!pendingDiagramOpenRef.current || !selectedSessionId) return;

    let cancelled = false;

    void (async () => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (cancelled) return;

        const { res, data } = await apiFetch(
          `/api/sessions/${selectedSessionId}`,
        );
        if (res.ok) {
          const session = data.session as Session | undefined;
          if (session?.hasVisualExplainer) {
            pendingDiagramOpenRef.current = false;
            setSessions((prev) =>
              prev.map((item) =>
                item.id === session.id ? { ...item, ...session } : item,
              ),
            );
            openVisualExplainerInNewTab(selectedSessionId, resolvedTheme);
            return;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, resolvedTheme]);

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
      normalizeYoutubeUrl(draftUrl.trim());
      const { res, data } = await apiFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ youtubeUrl: draftUrl.trim() }),
      });
      if (!res.ok) {
        throw new Error(String(data.error ?? "作成に失敗しました"));
      }

      const session = data.session as Session;
      setSessions((prev) => [session, ...prev]);
      setSelectedSessionId(session.id);
      setIsNewDraft(false);
      setDraftUrl("");

      if (geminiConfigured) {
        const usageRes = await fetch("/api/gemini/usage", {
          credentials: "include",
        });
        if (usageRes.ok) {
          const usageData = (await usageRes.json()) as {
            rateLimit?: { canProcessOneVideo?: boolean; nextResetLabel?: string };
          };
          if (usageData.rateLimit && !usageData.rateLimit.canProcessOneVideo) {
            alert(
              `本日の Gemini 枠が不足しています。動画は「待機中」キューに入り、枠が空き次第自動処理されます（日次リセット: ${usageData.rateLimit.nextResetLabel ?? "翌日"}）。`,
            );
          }
        }

        await fetch("/api/settings", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ polishTranscript: true }),
        });
      }

      const { res: processRes, data: processData } = await apiFetch(
        `/api/sessions/${session.id}/process`,
        { method: "POST" },
      );
      if (!processRes.ok) {
        throw new Error(String(processData.error ?? "処理に失敗しました"));
      }

      void refreshSessions(searchQuery.trim() || undefined);
      void refreshSession(session.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
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
    const res = await fetch("/api/sessions", {
      method: "DELETE",
      credentials: "include",
    });
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
    if (!selectedSessionId || !selectedSession) return;
    setPendingAction("reprocess");
    setIsCreating(true);
    applyOptimisticStatus(selectedSessionId, "fetching_captions");
    try {
      const { res, data } = await apiFetch(
        `/api/sessions/${selectedSessionId}/process`,
        { method: "POST" },
      );
      if (!res.ok) {
        throw new Error(String(data.error ?? "字幕の再取得に失敗しました"));
      }
      void refreshSessions(searchQuery.trim() || undefined);
      void refreshSession(selectedSessionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "字幕の再取得に失敗しました");
    } finally {
      setPendingAction(null);
      setIsCreating(false);
    }
  };

  const handleResummarize = async () => {
    if (!selectedSessionId) return;
    setPendingAction("resummarize");
    applyOptimisticStatus(selectedSessionId, "summarizing");
    try {
      const { res, data } = await apiFetch(
        `/api/sessions/${selectedSessionId}/process?action=resummarize`,
        { method: "POST" },
      );
      if (!res.ok) {
        throw new Error(String(data.error ?? "要約の再生成に失敗しました"));
      }
      void refreshSession(selectedSessionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "要約の再生成に失敗しました");
    } finally {
      setPendingAction(null);
    }
  };

  const handleGenerateDiagram = async () => {
    if (!selectedSessionId || !selectedSession?.summaryJson) return;
    const previewTab = prepareVisualExplainerTab();
    applyOptimisticStatus(selectedSessionId, "generating_diagram");
    try {
      const { res, data } = await apiFetch(
        `/api/sessions/${selectedSessionId}/process?action=diagram`,
        { method: "POST" },
      );
      if (!res.ok) {
        throw new Error(String(data.error ?? "図解の生成に失敗しました"));
      }
      const updated = data.session as Session | undefined;
      await refreshSession(selectedSessionId);
      if (updated?.hasVisualExplainer) {
        navigateVisualExplainerTab(
          previewTab,
          selectedSessionId,
          resolvedTheme,
        );
      } else {
        closeVisualExplainerTab(previewTab);
      }
    } catch (err) {
      closeVisualExplainerTab(previewTab);
      alert(err instanceof Error ? err.message : "図解の生成に失敗しました");
      void refreshSession(selectedSessionId);
    }
  };

  const handleRediagram = async () => {
    if (!selectedSessionId || !selectedSession?.summaryJson) return;
    const previewTab = prepareVisualExplainerTab();
    applyOptimisticStatus(selectedSessionId, "generating_diagram");
    try {
      const { res, data } = await apiFetch(
        `/api/sessions/${selectedSessionId}/process?action=rediagram`,
        { method: "POST" },
      );
      if (!res.ok) {
        throw new Error(String(data.error ?? "図解の再生成に失敗しました"));
      }
      const updated = data.session as Session | undefined;
      await refreshSession(selectedSessionId);
      if (updated?.hasVisualExplainer) {
        navigateVisualExplainerTab(
          previewTab,
          selectedSessionId,
          resolvedTheme,
        );
      } else {
        closeVisualExplainerTab(previewTab);
      }
    } catch (err) {
      closeVisualExplainerTab(previewTab);
      alert(err instanceof Error ? err.message : "図解の再生成に失敗しました");
      void refreshSession(selectedSessionId);
    }
  };

  const handleImportDiagram = async (html: string) => {
    if (!selectedSessionId) {
      throw new Error("セッションが選択されていません");
    }

    const { res, data } = await apiFetch(
      `/api/sessions/${selectedSessionId}/diagram`,
      {
        method: "POST",
        body: JSON.stringify({ html }),
      },
    );
    if (!res.ok) {
      throw new Error(String(data.error ?? "図解の取り込みに失敗しました"));
    }

    await refreshSession(selectedSessionId);
    openVisualExplainerInNewTab(selectedSessionId, resolvedTheme);
  };

  const handleRepolish = async () => {
    if (!selectedSessionId) return;
    setPendingAction("repolish");
    setIsCreating(true);
    applyOptimisticStatus(selectedSessionId, "polishing_transcript");
    try {
      const { res, data } = await apiFetch(
        `/api/sessions/${selectedSessionId}/process?action=repolish`,
        { method: "POST" },
      );
      if (!res.ok) {
        throw new Error(String(data.error ?? "字幕校正に失敗しました"));
      }
      void refreshSession(selectedSessionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "字幕校正に失敗しました");
    } finally {
      setPendingAction(null);
      setIsCreating(false);
    }
  };

  const handleNotesChange = async (html: string) => {
    if (!selectedSessionId) return;
    if (html === (selectedSession?.notesHtml ?? "")) return;
    const res = await fetch(`/api/sessions/${selectedSessionId}`, {
      method: "PATCH",
      credentials: "include",
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

  const handleAssignCategory = async (
    sessionId: string,
    categoryId: string | null,
  ) => {
    const categoryName =
      categoryId == null
        ? null
        : (categories.find((c) => c.id === categoryId)?.name ?? null);
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "カテゴリーの変更に失敗しました");
      return;
    }
    const data = (await res.json()) as { session: Session };
    const patch = {
      categoryId: data.session.categoryId,
      categoryName: data.session.categoryName ?? categoryName,
      updatedAt: data.session.updatedAt,
    };
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
    );
    setSearchResults((prev) =>
      prev
        ? prev.map((s) => (s.id === sessionId ? { ...s, ...patch } : s))
        : prev,
    );
    setSessionDetails((prev) => {
      const existing = prev[sessionId];
      if (!existing) return prev;
      return { ...prev, [sessionId]: { ...existing, ...patch } };
    });
  };

  const handleCreateCategory = async (name: string) => {
    const res = await fetch("/api/categories", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "カテゴリーの作成に失敗しました");
    }
    const data = (await res.json()) as { category: Category };
    setCategories((prev) => [...prev, data.category]);
  };

  const handleUpdateCategory = async (id: string, name: string) => {
    const res = await fetch("/api/categories", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "カテゴリーの更新に失敗しました");
    }
    const data = (await res.json()) as { category: Category };
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? data.category : c)),
    );
    const applyName = (s: Session) =>
      s.categoryId === id ? { ...s, categoryName: name } : s;
    setSessions((prev) => prev.map(applyName));
    setSearchResults((prev) => (prev ? prev.map(applyName) : prev));
  };

  const handleDeleteCategory = async (id: string) => {
    const res = await fetch(`/api/categories?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "カテゴリーの削除に失敗しました");
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    const clearCategory = (s: Session) =>
      s.categoryId === id
        ? { ...s, categoryId: null, categoryName: null }
        : s;
    setSessions((prev) => prev.map(clearCategory));
    setSearchResults((prev) => (prev ? prev.map(clearCategory) : prev));
    if (categoryFilter === id) {
      setCategoryFilter("all");
    }
  };

  const showPane2 = focusMode === "all" && !isNewDraft;
  const hasSelection = selectedSessionId != null && !isNewDraft;
  const bodiesReady =
    hasSelection && bodiesLoadedIds.has(selectedSessionId);
  const showPane3 =
    hasSelection && (focusMode === "all" || focusMode === "transcript");
  const showPane4 =
    hasSelection && (focusMode === "all" || focusMode === "notes");

  const processing =
    isCreating ||
    (selectedSession ? isProcessingStatus(selectedSession.status) : false);
  const isLoadingDetail =
    selectedSessionId != null &&
    !isNewDraft &&
    loadingSessionId === selectedSessionId;

  return (
    <SidebarProvider
      defaultOpen
      className="h-screen min-w-[1280px] w-full overflow-hidden bg-background text-foreground"
      style={
        {
          "--sidebar-width": `${libraryWidth}px`,
        } as CSSProperties
      }
    >
      <SessionLibraryPane
        sessions={listSessions}
        categories={categories}
        selectedSessionId={selectedSessionId}
        searchQuery={searchQuery}
        categoryFilter={categoryFilter}
        isSearching={isSearching}
        onSearchQueryChange={setSearchQuery}
        onCategoryFilterChange={setCategoryFilter}
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
        onAssignCategory={handleAssignCategory}
        onCreateCategory={handleCreateCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
      />

      <PaneResizer
        onResize={(delta) =>
          setLibraryWidth((width) => clampWidth(width + delta, 200, 480))
        }
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
                pendingAction={pendingAction}
                width={sourceWidth}
                onDraftUrlChange={setDraftUrl}
                onCreateSession={handleCreateSession}
                onReprocess={handleReprocess}
                onResummarize={handleResummarize}
                onRepolish={handleRepolish}
                geminiConfigured={geminiConfigured}
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
                session={selectedSession}
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
              session={selectedSession}
              bodiesReady={bodiesReady}
              geminiConfigured={geminiConfigured}
              isProcessing={processing || isLoadingDetail}
              onNotesChange={handleNotesChange}
              onResummarize={handleResummarize}
              onGenerateDiagram={handleGenerateDiagram}
              onRediagram={handleRediagram}
              onImportDiagram={handleImportDiagram}
              onCopySection={handleCopySection}
            />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
