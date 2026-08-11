import { NextResponse } from "next/server";
import { z } from "zod";

import { isGeminiConfigured } from "@/lib/ai/gemini";
import {
  getPolishTranscriptEnabled,
  getSummaryCustomPrompt,
  setPolishTranscriptEnabled,
  setSummaryCustomPrompt,
  SUMMARY_CUSTOM_PROMPT_MAX_LENGTH,
} from "@/lib/db/settings";

export async function GET() {
  const polishTranscript =
    isGeminiConfigured() && (await getPolishTranscriptEnabled());
  const summaryCustomPrompt = isGeminiConfigured()
    ? await getSummaryCustomPrompt()
    : "";

  return NextResponse.json({
    geminiConfigured: isGeminiConfigured(),
    polishTranscript,
    polishTranscriptAvailable: isGeminiConfigured(),
    summaryCustomPrompt,
    summaryCustomPromptMaxLength: SUMMARY_CUSTOM_PROMPT_MAX_LENGTH,
  });
}

const patchSchema = z.object({
  polishTranscript: z.boolean().optional(),
  summaryCustomPrompt: z
    .string()
    .max(SUMMARY_CUSTOM_PROMPT_MAX_LENGTH)
    .optional(),
});

export async function PATCH(request: Request) {
  try {
    const body = patchSchema.parse(await request.json());

    if (
      body.polishTranscript !== undefined ||
      body.summaryCustomPrompt !== undefined
    ) {
      if (!isGeminiConfigured()) {
        return NextResponse.json(
          { error: "GEMINI_API_KEY 未設定のため AI 設定は利用できません" },
          { status: 400 },
        );
      }
    }

    if (body.polishTranscript !== undefined) {
      await setPolishTranscriptEnabled(body.polishTranscript);
    }

    if (body.summaryCustomPrompt !== undefined) {
      await setSummaryCustomPrompt(body.summaryCustomPrompt);
    }

    const polishTranscript =
      isGeminiConfigured() && (await getPolishTranscriptEnabled());
    const summaryCustomPrompt = isGeminiConfigured()
      ? await getSummaryCustomPrompt()
      : "";

    return NextResponse.json({
      geminiConfigured: isGeminiConfigured(),
      polishTranscript,
      polishTranscriptAvailable: isGeminiConfigured(),
      summaryCustomPrompt,
      summaryCustomPromptMaxLength: SUMMARY_CUSTOM_PROMPT_MAX_LENGTH,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "設定の更新に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
