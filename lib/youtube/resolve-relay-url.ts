import {
  getTranscriptRelayUrl,
} from "@/lib/db/settings";
import { normalizeRelayUrl } from "@/lib/youtube/relay-url";

/**
 * リレー URL の解決順:
 * 1. TRANSCRIPT_RELAY_URL（Vercel 固定 URL・名前付きトンネル）
 * 2. Turso app_settings（クイックトンネル自動登録）
 */
export async function resolveRelayUrl(): Promise<string | null> {
  const envUrl = process.env.TRANSCRIPT_RELAY_URL?.trim();
  if (envUrl) {
    return normalizeRelayUrl(envUrl);
  }

  const dbUrl = await getTranscriptRelayUrl();
  if (dbUrl) {
    return normalizeRelayUrl(dbUrl);
  }

  return null;
}
