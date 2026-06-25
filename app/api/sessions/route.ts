import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { listSessionSummaries, insertSession, deleteAllSessions } from "@/lib/db/sessions";
import {
  extractYoutubeId,
  normalizeYoutubeUrl,
} from "@/lib/youtube/parse-url";

export const maxDuration = 60;

const createSchema = z.object({
  youtubeUrl: z.string().min(1),
  transcript: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const sessions = await listSessionSummaries({ search });
  return NextResponse.json({ sessions });
}

export async function DELETE() {
  const count = await deleteAllSessions();
  return NextResponse.json({ ok: true, count });
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const youtubeUrl = normalizeYoutubeUrl(body.youtubeUrl);
    const youtubeId = extractYoutubeId(youtubeUrl)!;

    const id = randomUUID();
    const session = await insertSession({
      id,
      youtubeUrl,
      youtubeId,
      transcript: body.transcript,
      title: body.title,
      thumbnailUrl: body.thumbnailUrl,
      categoryId: body.categoryId,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "セッションの作成に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
