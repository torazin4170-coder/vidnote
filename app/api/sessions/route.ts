import { randomUUID } from "node:crypto";

import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { listSessionSummaries, insertSession, deleteAllSessions } from "@/lib/db/sessions";
import { drainJobQueue, enqueueSessionProcessing } from "@/lib/jobs/processor";
import {
  extractYoutubeId,
  normalizeYoutubeUrl,
} from "@/lib/youtube/parse-url";

export const maxDuration = 60;

const createSchema = z.object({
  youtubeUrl: z.string().min(1),
});

export async function GET() {
  const sessions = await listSessionSummaries();
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
    const session = await insertSession({ id, youtubeUrl, youtubeId });

    after(async () => {
      await enqueueSessionProcessing(session.id);
      await drainJobQueue();
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "セッションの作成に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
