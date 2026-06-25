import { NextResponse } from "next/server";

import { getSession, getSessionMeta } from "@/lib/db/sessions";
import { sanitizeSessionForClient } from "@/lib/session-list";
import {
  drainJobQueue,
  generateDiagramSession,
  reprocessSession,
  repolishSession,
  summarizeSession,
} from "@/lib/jobs/processor";

export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(session: NonNullable<Awaited<ReturnType<typeof getSessionMeta>>>) {
  return NextResponse.json(
    {
      error: session.errorMessage ?? "処理に失敗しました",
      session: sanitizeSessionForClient(session),
    },
    { status: 400 },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "process";

  try {
    if (action === "resummarize" || action === "summarize") {
      await summarizeSession(id);
    } else if (action === "repolish") {
      await repolishSession(id);
    } else if (action === "diagram" || action === "rediagram") {
      await generateDiagramSession(id);
    } else {
      await reprocessSession(id);
      await drainJobQueue();
    }

    const updated = await getSessionMeta(id);
    if (!updated) {
      return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
    }
    if (updated.status === "error") {
      return errorResponse(updated);
    }
    return NextResponse.json({ session: sanitizeSessionForClient(updated) });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "処理の開始に失敗しました";
    const updated = await getSessionMeta(id);
    return NextResponse.json(
      {
        error: message,
        session: updated ? sanitizeSessionForClient(updated) : undefined,
      },
      { status: 400 },
    );
  }
}
