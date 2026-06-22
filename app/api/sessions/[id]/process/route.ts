import { NextResponse } from "next/server";

import { getSession } from "@/lib/db/sessions";
import {
  drainJobQueue,
  reprocessSession,
  summarizeSession,
} from "@/lib/jobs/processor";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

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
    } else {
      await reprocessSession(id);
      await drainJobQueue();
    }

    const updated = await getSession(id);
    return NextResponse.json({ session: updated });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "処理の開始に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
