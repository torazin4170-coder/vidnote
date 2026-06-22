import { YoutubeTranscript } from "youtube-transcript";

import {
  segmentsToTranscript,
  type TranscriptSegment,
} from "@/lib/youtube/transcript-text";

function friendlyTranscriptError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("429") || message.includes("Too Many Requests")) {
    return "YouTube から一時的にアクセス制限（429）がかかっています。5〜10 分待ってから再試行してください。";
  }

  if (message.includes("Transcript is disabled")) {
    return "この動画では字幕が無効になっています。";
  }

  if (message.includes("No transcripts are available")) {
    return "この動画には字幕トラックがありません。";
  }

  if (message.includes("captcha")) {
    return "YouTube がボット判定を要求しています。しばらく待ってから再試行してください。";
  }

  return message.replace(/^\[YoutubeTranscript\]\s*🚨\s*/, "");
}

async function fetchSegments(videoId: string): Promise<TranscriptSegment[]> {
  const langs = ["ja", "ja-JP", "en", "en-US"];
  let lastError: Error | null = null;

  for (const lang of langs) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      if (items.length > 0) {
        return items.map((item) => ({
          startSec: item.offset / 1000,
          text: item.text.trim(),
        }));
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    if (items.length > 0) {
      return items.map((item) => ({
        startSec: item.offset / 1000,
        text: item.text.trim(),
      }));
    }
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
  }

  throw new Error(friendlyTranscriptError(lastError));
}

export async function fetchCaptionsInBrowser(videoId: string): Promise<{
  segments: TranscriptSegment[];
  transcript: string;
}> {
  const segments = await fetchSegments(videoId);
  return {
    segments,
    transcript: segmentsToTranscript(segments),
  };
}
