import { NextResponse } from "next/server";
import { z } from "zod";

import { setTranscriptRelayUrl } from "@/lib/db/settings";
import { verifyRelaySecret } from "@/lib/relay/verify-secret";
import { normalizeRelayUrl } from "@/lib/youtube/relay-url";

const registerSchema = z.object({
  url: z.string().min(1),
});

export async function POST(request: Request) {
  if (!verifyRelaySecret(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  try {
    const body = registerSchema.parse(await request.json());
    const url = normalizeRelayUrl(body.url);
    await setTranscriptRelayUrl(url);

    return NextResponse.json({
      ok: true,
      url,
      message:
        "リレー URL を登録しました。Vercel の再デプロイは不要です（TRANSCRIPT_RELAY_URL 未設定時）。",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "リレー URL の登録に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
