import { NextResponse } from "next/server";
import { z } from "zod";

import { extractYoutubeId, normalizeYoutubeUrl } from "@/lib/youtube/parse-url";
import { fetchTranscriptServer } from "@/lib/youtube/transcript-server";

export const maxDuration = 60;

const bodySchema = z.object({
  youtubeUrl: z.string().min(1).optional(),
  videoId: z.string().min(11).max(11).optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const youtubeUrl = body.youtubeUrl
      ? normalizeYoutubeUrl(body.youtubeUrl)
      : null;
    const videoId =
      body.videoId ?? (youtubeUrl ? extractYoutubeId(youtubeUrl) : null);

    if (!videoId) {
      return NextResponse.json(
        { error: "有効な YouTube URL または videoId が必要です" },
        { status: 400 },
      );
    }

    const url = youtubeUrl ?? `https://www.youtube.com/watch?v=${videoId}`;
    const result = await fetchTranscriptServer(videoId, url);

    return NextResponse.json({
      videoId,
      youtubeUrl: url,
      transcript: result.transcript,
      title: result.title,
      thumbnailUrl: result.thumbnailUrl,
      durationSec: result.durationSec,
      source: result.source,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "字幕の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
