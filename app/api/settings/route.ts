import { NextResponse } from "next/server";

import { isGeminiConfigured } from "@/lib/ai/gemini";

export async function GET() {
  return NextResponse.json({
    geminiConfigured: isGeminiConfigured(),
  });
}
