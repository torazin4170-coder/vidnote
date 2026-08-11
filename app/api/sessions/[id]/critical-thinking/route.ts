import { NextResponse } from "next/server";

import {
  friendlyGeminiError,
  generateCriticalThinkingNotes,
  isGeminiConfigured,
} from "@/lib/ai/gemini";
import { getSession, updateSession } from "@/lib/db/sessions";
import { appendCriticalThinkingToNotes } from "@/lib/notes/append-critical-thinking";
import { sanitizeSessionForClient } from "@/lib/session-list";
import {
  htmlToPlainTranscript,
  stripTranscriptFormatting,
} from "@/lib/rich-text/transcript-content";

export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }

  const transcript = stripTranscriptFormatting(session.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json(
      { error: "文字起こしがありません。先に字幕を取得してください。" },
      { status: 400 },
    );
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY が未設定のため利用できません。" },
      { status: 400 },
    );
  }

  try {
    const plain = await generateCriticalThinkingNotes(
      {
        title: session.title?.trim() || session.youtubeUrl,
        summary: session.summaryJson,
        transcript,
        notesPlain: htmlToPlainTranscript(session.notesHtml ?? "").trim(),
      },
      { sessionId: id },
    );

    const notesHtml = appendCriticalThinkingToNotes(session.notesHtml, plain);
    const updated = await updateSession(id, { notesHtml });
    if (!updated) {
      return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({
      session: sanitizeSessionForClient(updated),
      notesHtml,
    });
  } catch (err) {
    const message = friendlyGeminiError(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
