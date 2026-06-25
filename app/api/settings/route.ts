import { NextResponse } from "next/server";
import { z } from "zod";

import { isGeminiConfigured } from "@/lib/ai/gemini";
import {
  getPolishTranscriptEnabled,
  setPolishTranscriptEnabled,
} from "@/lib/db/settings";

export async function GET() {
  const polishTranscript =
    isGeminiConfigured() && (await getPolishTranscriptEnabled());

  return NextResponse.json({
    geminiConfigured: isGeminiConfigured(),
    polishTranscript,
    polishTranscriptAvailable: isGeminiConfigured(),
  });
}

const patchSchema = z.object({
  polishTranscript: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  try {
    const body = patchSchema.parse(await request.json());

    if (body.polishTranscript !== undefined) {
      if (!isGeminiConfigured()) {
        return NextResponse.json(
          { error: "GEMINI_API_KEY 未設定のため字幕校正は利用できません" },
          { status: 400 },
        );
      }
      await setPolishTranscriptEnabled(body.polishTranscript);
    }

    const polishTranscript =
      isGeminiConfigured() && (await getPolishTranscriptEnabled());

    return NextResponse.json({
      geminiConfigured: isGeminiConfigured(),
      polishTranscript,
      polishTranscriptAvailable: isGeminiConfigured(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "設定の更新に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
