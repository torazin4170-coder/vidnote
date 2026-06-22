import {
  getPendingSessionIds,
  getProcessingSessionId,
  getSession,
  recoverStaleProcessingSessions,
  updateSession,
} from "@/lib/db/sessions";
import { summarizeTranscript, isGeminiConfigured } from "@/lib/ai/gemini";
import { fetchCaptions } from "@/lib/youtube/captions";
import { youtubeWatchUrl } from "@/lib/youtube/parse-url";

let queueRunning = false;

async function processSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;

  try {
    await updateSession(sessionId, {
      status: "fetching_captions",
      errorMessage: null,
    });

    const url = session.youtubeId
      ? youtubeWatchUrl(session.youtubeId)
      : session.youtubeUrl;

    const captions = await fetchCaptions(url);

    await updateSession(sessionId, {
      title: captions.metadata.title,
      thumbnailUrl: captions.metadata.thumbnailUrl,
      durationSec: captions.metadata.durationSec,
      transcript: captions.transcript,
      status: "transcribed",
    });

    if (!isGeminiConfigured()) {
      await updateSession(sessionId, {
        status: "done",
        errorMessage: null,
      });
      return;
    }

    await updateSession(sessionId, { status: "summarizing" });

    const summary = await summarizeTranscript(captions.transcript);

    await updateSession(sessionId, {
      summaryJson: JSON.stringify(summary),
      status: "done",
      errorMessage: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "処理中にエラーが発生しました";
    await updateSession(sessionId, {
      status: "error",
      errorMessage: message,
    });
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
    transcript: null,
    summaryJson: null,
    errorMessage: null,
  });
}

export async function resummarizeSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session?.transcript) {
    throw new Error("文字起こしがありません");
  }
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_API_KEY が未設定です");
  }

  await updateSession(sessionId, { status: "summarizing", errorMessage: null });

  try {
    const summary = await summarizeTranscript(session.transcript);
    await updateSession(sessionId, {
      summaryJson: JSON.stringify(summary),
      status: "done",
      errorMessage: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "要約に失敗しました";
    await updateSession(sessionId, {
      status: "error",
      errorMessage: message,
    });
    throw err;
  }
}
