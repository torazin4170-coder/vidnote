import { YoutubeTranscript } from "youtube-transcript";

import { fetchCaptions, fetchMetadataViaOembed, type VideoMetadata } from "@/lib/youtube/captions";
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

async function fetchViaRelay(videoId: string): Promise<TranscriptServerResult> {
  const relayUrl = process.env.TRANSCRIPT_RELAY_URL?.trim();
  if (!relayUrl) {
    throw new Error("TRANSCRIPT_RELAY_URL が未設定です");
  }

  const secret = process.env.TRANSCRIPT_RELAY_SECRET?.trim();
  const res = await fetch(`${relayUrl.replace(/\/$/, "")}/transcript`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ videoId }),
    cache: "no-store",
  });

  const data = (await res.json()) as {
    transcript?: string;
    title?: string | null;
    thumbnailUrl?: string | null;
    durationSec?: number | null;
    error?: string;
  };

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
  if (process.env.TRANSCRIPT_RELAY_URL?.trim()) {
    try {
      return await fetchViaRelay(videoId);
    } catch (relayErr) {
      const message =
        relayErr instanceof Error ? relayErr.message : String(relayErr);
      throw new Error(`リレー字幕取得エラー: ${message}`);
    }
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
