import { NextResponse } from "next/server";

import { setDiagramImportTarget } from "@/lib/db/diagram-import-target";
import { getSessionMeta } from "@/lib/db/sessions";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getSessionMeta(id);
  if (!session) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }

  const target = await setDiagramImportTarget({
    sessionId: id,
    title: session.title?.trim() || session.youtubeUrl,
  });

  return NextResponse.json({ ok: true, target });
}
