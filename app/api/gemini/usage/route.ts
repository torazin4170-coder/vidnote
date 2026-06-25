import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getGeminiUsageReport,
  isGeminiConfigured,
  setGeminiUsageQuota,
} from "@/lib/ai/gemini";

export async function GET() {
  if (!isGeminiConfigured()) {
    return NextResponse.json({
      configured: false,
      summary: null,
      quota: null,
      gauges: [],
      rateLimit: null,
    });
  }

  const report = await getGeminiUsageReport();
  return NextResponse.json({
    configured: true,
    ...report,
  });
}

const patchSchema = z.object({
  dailyRequestLimit: z.number().int().positive().max(1_000_000).optional(),
  dailyTokenLimit: z.number().int().positive().max(100_000_000).optional(),
  minuteRequestLimit: z.number().int().positive().max(10_000).optional(),
});

export async function PATCH(request: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY 未設定のため利用量設定は変更できません" },
      { status: 400 },
    );
  }

  try {
    const body = patchSchema.parse(await request.json());
    await setGeminiUsageQuota(body);
    const report = await getGeminiUsageReport();
    return NextResponse.json({
      configured: true,
      quota: report.quota,
      gauges: report.gauges,
      rateLimit: report.rateLimit,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "利用量上限の更新に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
