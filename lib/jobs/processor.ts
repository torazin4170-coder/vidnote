import {
  getPendingSessionIds,
  getProcessingSessionId,
  getSession,
  recoverStaleProcessingSessions,
  updateSession,
} from "@/lib/db/sessions";
import { getPolishTranscriptEnabled } from "@/lib/db/settings";
import {
  friendlyGeminiError,
  generateVisualExplainer,
  isGeminiConfigured,
  polishTranscript,
  summarizeTranscript,
} from "@/lib/ai/gemini";
import {
  GeminiDailyQuotaExceededError,
  getGeminiRateLimitStatus,
} from "@/lib/ai/gemini-rate-limit";
import { appendSummarySectionsToNotes } from "@/lib/notes/append-summary-sections";
import { stripTranscriptFormatting } from "@/lib/rich-text/transcript-content";
import { fetchTranscriptServer } from "@/lib/youtube/transcript-server";
import { extractYoutubeId, youtubeWatchUrl } from "@/lib/youtube/parse-url";

let queueRunning = false;

async function deferSessionForGeminiQuota(
  sessionId: string,
  message: string,
): Promise<void> {
  await updateSession(sessionId, {
    status: "pending",
    errorMessage: message,
  });
}

async function ensureGeminiCapacity(sessionId: string): Promise<boolean> {
  if (!isGeminiConfigured()) return true;

  const status = await getGeminiRateLimitStatus();
  if (status.canProcessOneVideo) return true;

  await deferSessionForGeminiQuota(
    sessionId,
    status.blockedByRpd || status.remainingRequestsToday < status.callsPerVideo
      ? `Gemini 日次上限のため待機中（本日残り ${status.remainingRequestsToday} 回 / 1本約 ${status.callsPerVideo} 回）。${status.nextResetLabel} 以降に再開します。`
      : `Gemini RPM 上限のため待機中。1〜2 分後に自動再開します。`,
  );
  return false;
}

async function applyPolishIfEnabled(
  sessionId: string,
  rawTranscript: string,
): Promise<string> {
  if (!isGeminiConfigured()) return rawTranscript;

  const polishEnabled = await getPolishTranscriptEnabled();
  if (!polishEnabled) return rawTranscript;

  await updateSession(sessionId, {
    status: "polishing_transcript",
    errorMessage: null,
  });

  try {
    return await polishTranscript(rawTranscript, { sessionId });
  } catch {
    return rawTranscript;
  }
}

async function processSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;

  try {
    let rawTranscript =
      session.transcriptRaw?.trim() ?? session.transcript?.trim() ?? "";

    if (!rawTranscript) {
      await updateSession(sessionId, {
        status: "fetching_captions",
        errorMessage: null,
      });

      const url = session.youtubeId
        ? youtubeWatchUrl(session.youtubeId)
        : session.youtubeUrl;

      const videoId = session.youtubeId ?? extractYoutubeId(url)!;
      const captions = await fetchTranscriptServer(videoId, url);
      rawTranscript = captions.transcript;

      if (!(await ensureGeminiCapacity(sessionId))) {
        await updateSession(sessionId, {
          title: captions.title,
          thumbnailUrl: captions.thumbnailUrl,
          durationSec: captions.durationSec,
          transcriptRaw: rawTranscript,
          transcript: rawTranscript,
        });
        return;
      }

      const polished = await applyPolishIfEnabled(sessionId, rawTranscript);

      await updateSession(sessionId, {
        title: captions.title,
        thumbnailUrl: captions.thumbnailUrl,
        durationSec: captions.durationSec,
        transcriptRaw: rawTranscript,
        transcript: polished,
        status: "transcribed",
      });
    } else if (
      !session.transcript?.trim() ||
      session.transcript === session.transcriptRaw
    ) {
      if (!(await ensureGeminiCapacity(sessionId))) return;

      const polished = await applyPolishIfEnabled(sessionId, rawTranscript);
      await updateSession(sessionId, {
        transcriptRaw: rawTranscript,
        transcript: polished,
        status: "transcribed",
      });
    }

    const current = await getSession(sessionId);
    const transcript = current?.transcript?.trim() ?? rawTranscript;

    if (!isGeminiConfigured()) {
      await updateSession(sessionId, {
        status: "done",
        errorMessage: null,
      });
      return;
    }

    if (!(await ensureGeminiCapacity(sessionId))) return;

    await updateSession(sessionId, { status: "summarizing", errorMessage: null });

    const summary = await summarizeTranscript(
      stripTranscriptFormatting(transcript),
      { sessionId },
    );

    const notesSource = await getSession(sessionId);
    await updateSession(sessionId, {
      summaryJson: JSON.stringify(summary),
      notesHtml: appendSummarySectionsToNotes(
        notesSource?.notesHtml,
        summary,
      ),
      status: "done",
      errorMessage: null,
    });
  } catch (err) {
    if (err instanceof GeminiDailyQuotaExceededError) {
      await deferSessionForGeminiQuota(sessionId, err.message);
      return;
    }
    const message = friendlyGeminiError(err);
    await updateSession(sessionId, {
      status: "error",
      errorMessage: message,
    });
  }
}

export async function summarizeSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session?.transcript?.trim()) {
    throw new Error("文字起こしがありません");
  }
  if (!isGeminiConfigured()) {
    await updateSession(sessionId, {
      status: "done",
      errorMessage: null,
    });
    return;
  }

  await updateSession(sessionId, { status: "summarizing", errorMessage: null });

  try {
    const summary = await summarizeTranscript(
      stripTranscriptFormatting(session.transcript),
      { sessionId },
    );
    await updateSession(sessionId, {
      summaryJson: JSON.stringify(summary),
      notesHtml: appendSummarySectionsToNotes(session.notesHtml, summary),
      status: "done",
      errorMessage: null,
    });
  } catch (err) {
    const message = friendlyGeminiError(err);
    await updateSession(sessionId, {
      status: "error",
      errorMessage: message,
    });
    throw new Error(message);
  }
}

export async function repolishSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("セッションが見つかりません");
  }

  const raw =
    session.transcriptRaw?.trim() ?? session.transcript?.trim() ?? "";
  if (!raw) {
    throw new Error("校正する字幕がありません");
  }
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_API_KEY が未設定のため字幕校正は利用できません");
  }

  await updateSession(sessionId, {
    status: "polishing_transcript",
    errorMessage: null,
  });

  try {
    const polished = await polishTranscript(raw, { sessionId });
    await updateSession(sessionId, {
      transcriptRaw: raw,
      transcript: polished,
      status: session.summaryJson ? "done" : "transcribed",
      errorMessage: null,
    });
  } catch (err) {
    const message = friendlyGeminiError(err);
    await updateSession(sessionId, {
      transcript: raw,
      status: session.summaryJson ? "done" : "transcribed",
      errorMessage: message,
    });
    throw new Error(message);
  }
}

export async function drainJobQueue(): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;

  try {
    await recoverStaleProcessingSessions();

    while (true) {
      const active = await getProcessingSessionId();
      if (active) break;

      const pending = await getPendingSessionIds();
      if (pending.length === 0) break;

      if (isGeminiConfigured()) {
        const status = await getGeminiRateLimitStatus();
        if (!status.canProcessOneVideo) {
          break;
        }
      }

      await processSession(pending[0]!);
    }
  } finally {
    queueRunning = false;
  }
}

export async function enqueueSessionProcessing(
  sessionId: string,
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;

  if (session.status !== "pending" && session.status !== "error") {
    return;
  }

  await updateSession(sessionId, {
    status: "pending",
    errorMessage: null,
  });
}

export async function reprocessSession(sessionId: string): Promise<void> {
  await updateSession(sessionId, {
    status: "pending",
    transcriptRaw: null,
    transcript: null,
    summaryJson: null,
    visualExplainerHtml: null,
    errorMessage: null,
  });
}

export async function resummarizeSession(sessionId: string): Promise<void> {
  await summarizeSession(sessionId);
}

const TRANSCRIPT_EXCERPT_LIMIT = 12_000;

export async function generateDiagramSession(
  sessionId: string,
  options?: { throwOnError?: boolean },
): Promise<void> {
  const throwOnError = options?.throwOnError !== false;
  const session = await getSession(sessionId);
  if (!session?.summaryJson) {
    const message = "要約がありません。先に要点を生成してください。";
    if (throwOnError) throw new Error(message);
    await updateSession(sessionId, { status: "done", errorMessage: null });
    return;
  }
  if (!isGeminiConfigured()) {
    const message = "GEMINI_API_KEY が未設定のため図解生成は利用できません";
    if (throwOnError) throw new Error(message);
    await updateSession(sessionId, { status: "done", errorMessage: null });
    return;
  }

  await updateSession(sessionId, {
    status: "generating_diagram",
    errorMessage: null,
  });

  try {
    const title = session.title?.trim() || session.youtubeUrl;
    const transcriptExcerpt = session.transcript
      ?.trim()
      .slice(0, TRANSCRIPT_EXCERPT_LIMIT);

    const html = await generateVisualExplainer(
      {
        title,
        summary: session.summaryJson,
        transcriptExcerpt,
      },
      { sessionId },
    );

    await updateSession(sessionId, {
      visualExplainerHtml: html,
      status: "done",
      errorMessage: null,
    });
  } catch (err) {
    const message = friendlyGeminiError(err);
    await updateSession(sessionId, {
      status: "done",
      errorMessage: throwOnError ? message : null,
    });
    if (throwOnError) {
      throw new Error(message);
    }
  }
}
