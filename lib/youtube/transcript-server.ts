import { YoutubeTranscript } from "youtube-transcript";

import { isVercel } from "@/lib/env";
import { resolveRelayUrl } from "@/lib/youtube/resolve-relay-url";
import {
  fetchCaptions,
  fetchMetadataViaOembed,
  type VideoMetadata,
} from "@/lib/youtube/captions";
import { youtubeWatchUrl } from "@/lib/youtube/parse-url";
import {
  segmentsToTranscript,
  type TranscriptSegment,
} from "@/lib/youtube/transcript-text";

export type TranscriptServerResult = {
  transcript: string;
  title: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  source: "direct" | "relay" | "proxy";
};

function friendlyTranscriptError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("429") || message.includes("Too Many Requests")) {
    return "YouTube から一時的にアクセス制限（429）がかかっています。5〜10 分待ってから再試行してください。";
  }

  if (
    message.includes("Transcript is disabled") ||
    message.includes("No transcripts are available")
  ) {
    return "Vercel 上では YouTube がクラウド IP をブロックするため字幕を取得できません。自宅 PC のリレー（TRANSCRIPT_RELAY_URL）を設定するか、ローカル版（npm run dev）をご利用ください。";
  }

  if (message.includes("captcha")) {
    return "YouTube がボット判定を要求しています。しばらく待ってから再試行してください。";
  }

  return message.replace(/^\[YoutubeTranscript\]\s*🚨\s*/, "");
}

async function fetchViaRelay(
  videoId: string,
  relayUrl: string,
): Promise<TranscriptServerResult> {
  const secret = process.env.TRANSCRIPT_RELAY_SECRET?.trim();
  const endpoint = `${relayUrl}/transcript`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
  };
  const body = JSON.stringify({ videoId });

  const maxAttempts = 3;
  let lastStatus = 0;
  let lastRaw = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        cache: "no-store",
      });
    } catch (err) {
      const networkMessage = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        continue;
      }
      throw new Error(
        `トンネルに接続できません（${networkMessage}）。VidNote Relay を起動し直し、「Registered with VidNote」と表示されるまで待ってから再試行してください。`,
      );
    }

    lastStatus = res.status;
    lastRaw = await res.text();
    const contentType = res.headers.get("content-type") ?? "";

    if (res.status === 401) {
      throw new Error(
        "リレー認証に失敗しました（HTTP 401）。Vercel の TRANSCRIPT_RELAY_SECRET が自宅 PC のリレーと一致しているか確認してください。",
      );
    }

    if (contentType.includes("application/json")) {
      break;
    }

    if ((res.status === 502 || res.status === 503) && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      continue;
    }

    const hint =
      res.status === 502 || res.status === 503
        ? "デスクトップの「VidNote Relay」または scripts/start-relay-tunnel.ps1 で cloudflared トンネルも起動してください。"
        : "PC で VidNote Relay を再起動してください。";
    throw new Error(
      `リレー URL が無効か、トンネルが停止しています（HTTP ${res.status}）。${hint}`,
    );
  }

  const raw = lastRaw;
  const res = { ok: lastStatus >= 200 && lastStatus < 300, status: lastStatus };

  let data: {
    transcript?: string;
    title?: string | null;
    thumbnailUrl?: string | null;
    durationSec?: number | null;
    error?: string;
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error(
      "リレーから不正な応答が返りました。トンネル URL の有効期限切れの可能性があります。",
    );
  }

  if (!res.ok || !data.transcript?.trim()) {
    throw new Error(data.error ?? "リレー経由の字幕取得に失敗しました");
  }

  return {
    transcript: data.transcript.trim(),
    title: data.title ?? null,
    thumbnailUrl: data.thumbnailUrl ?? null,
    durationSec: data.durationSec ?? null,
    source: "relay",
  };
}

async function fetchViaProxy(videoId: string): Promise<string> {
  const proxyUrl = process.env.TRANSCRIPT_PROXY_URL?.trim();
  if (!proxyUrl) {
    throw new Error("TRANSCRIPT_PROXY_URL が未設定です");
  }

  const { ProxyAgent, fetch: undiciFetch } = await import("undici");
  const dispatcher = new ProxyAgent(proxyUrl);
  const proxyFetch: typeof fetch = (input, init) =>
    undiciFetch(input as string, {
      ...(init as Record<string, unknown>),
      dispatcher,
    }) as unknown as Promise<Response>;

  const langs = ["ja", "ja-JP", "en", "en-US"];
  let lastError: Error | null = null;

  for (const lang of langs) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId, {
        lang,
        fetch: proxyFetch,
      });
      if (items.length > 0) {
        const segments: TranscriptSegment[] = items.map((item) => ({
          startSec: item.offset / 1000,
          text: item.text.trim(),
        }));
        return segmentsToTranscript(segments);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(friendlyTranscriptError(lastError));
}

async function fetchDirect(
  videoId: string,
  youtubeUrl: string,
): Promise<TranscriptServerResult> {
  const captions = await fetchCaptions(youtubeUrl);
  return {
    transcript: captions.transcript,
    title: captions.metadata.title,
    thumbnailUrl: captions.metadata.thumbnailUrl,
    durationSec: captions.metadata.durationSec,
    source: "direct",
  };
}

async function fetchViaProxyWithMetadata(
  videoId: string,
  youtubeUrl: string,
): Promise<TranscriptServerResult> {
  const transcript = await fetchViaProxy(videoId);
  let metadata: VideoMetadata;
  try {
    metadata = await fetchMetadataViaOembed(youtubeUrl, videoId);
  } catch {
    metadata = {
      id: videoId,
      title: "無題の動画",
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSec: 0,
    };
  }

  return {
    transcript,
    title: metadata.title,
    thumbnailUrl: metadata.thumbnailUrl,
    durationSec: metadata.durationSec,
    source: "proxy",
  };
}

export async function fetchTranscriptServer(
  videoId: string,
  youtubeUrl = youtubeWatchUrl(videoId),
): Promise<TranscriptServerResult> {
  const relayUrl = await resolveRelayUrl();
  if (relayUrl) {
    try {
      return await fetchViaRelay(videoId, relayUrl);
    } catch (relayErr) {
      const message =
        relayErr instanceof Error ? relayErr.message : String(relayErr);
      throw new Error(`リレー字幕取得エラー: ${message}`);
    }
  }

  if (isVercel()) {
    throw new Error(
      "Vercel では字幕リレーが必要です。自宅 PC で VidNote Relay を起動するか、README の「固定 URL トンネル」を参照してください。",
    );
  }

  try {
    return await fetchDirect(videoId, youtubeUrl);
  } catch (directErr) {
    if (process.env.TRANSCRIPT_PROXY_URL?.trim()) {
      try {
        return await fetchViaProxyWithMetadata(videoId, youtubeUrl);
      } catch (proxyErr) {
        throw new Error(
          friendlyTranscriptError(proxyErr ?? directErr),
        );
      }
    }
    throw new Error(friendlyTranscriptError(directErr));
  }
}
