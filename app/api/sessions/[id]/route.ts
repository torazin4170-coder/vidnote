import { NextResponse } from "next/server";
import { z } from "zod";

import {
  deleteSession,
  getSession,
  updateSession,
} from "@/lib/db/sessions";

const patchSchema = z.object({
  notesHtml: z.string().optional(),
  transcript: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  resetForReprocess: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const existing = await getSession(id);
  if (!existing) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }

  try {
    const body = patchSchema.parse(await request.json());
    const session = await updateSession(id, {
      notesHtml: body.notesHtml ?? existing.notesHtml,
      transcript: body.transcript ?? existing.transcript,
      title: body.title !== undefined ? body.title : existing.title,
      thumbnailUrl:
        body.thumbnailUrl !== undefined
          ? body.thumbnailUrl
          : existing.thumbnailUrl,
      ...(body.transcript || body.resetForReprocess
        ? {
            status: "transcribed",
            summaryJson: null,
            errorMessage: null,
          }
        : {}),
    });
    return NextResponse.json({ session });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "更新に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ok = await deleteSession(id);
  if (!ok) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
