import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { YoutubeTranscript } from "youtube-transcript";

import { isYtdlpAvailable } from "@/lib/env";
import { getDataDir } from "@/lib/paths";
import {
  segmentsToTranscript,
  type TranscriptSegment,
} from "@/lib/youtube/transcript-text";
import { extractYoutubeId, normalizeYoutubeUrl } from "@/lib/youtube/parse-url";

export type { TranscriptSegment };

export type CaptionsResult = {
  metadata: VideoMetadata;
  segments: TranscriptSegment[];
  transcript: string;
};

export type VideoMetadata = {
  id: string;
  title: string;
  thumbnailUrl: string;
  durationSec: number;
};

type YtdlpJson = {
  id: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
};

function getYtdlpPath(): string {
  return process.env.YTDLP_PATH?.trim() || "yt-dlp";
}

function getCookiesBrowser(): string | null {
  const configured = process.env.YTDLP_COOKIES_BROWSER?.trim();
  if (!configured || configured === "none") return null;
  return configured;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs = 180_000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} がタイムアウトしました`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `${command} を実行できません。yt-dlp のパスを確認してください: ${err.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            `${command} が終了コード ${code} で失敗しました: ${stderr || stdout}`,
          ),
        );
    });
  });
}

function buildYtdlpBaseArgs(includeCookies: boolean): string[] {
  const args = [
    "--sleep-requests",
    "1",
    "--sleep-subtitles",
    "2",
    "--retries",
    "3",
    "--ignore-errors",
  ];

  if (includeCookies) {
    const browser = getCookiesBrowser();
    if (browser) {
      args.push("--cookies-from-browser", browser);
    }
  }

  return args;
}

async function runYtdlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const withCookies = getCookiesBrowser() != null;
  try {
    return await runCommand(getYtdlpPath(), [
      ...buildYtdlpBaseArgs(withCookies),
      ...args,
    ]);
  } catch (err) {
    if (!withCookies) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("cookie") ||
      message.includes("Cookie") ||
      message.includes("Could not copy")
    ) {
      return runCommand(getYtdlpPath(), [
        ...buildYtdlpBaseArgs(false),
        ...args,
      ]);
    }
    throw err;
  }
}

function pickSubtitleLang(
  manual: Record<string, unknown> | undefined,
  auto: Record<string, unknown> | undefined,
): { lang: string; auto: boolean } | null {
  const pickFrom = (keys: string[]) => {
    const ja = keys.find((k) => k === "ja" || k.startsWith("ja-"));
    if (ja) return ja;
    const en = keys.find((k) => k === "en" || k.startsWith("en-"));
    if (en) return en;
    return keys[0];
  };

  const manualKeys = Object.keys(manual ?? {});
  const manualLang = pickFrom(manualKeys);
  if (manualLang) return { lang: manualLang, auto: false };

  const autoKeys = Object.keys(auto ?? {});
  const autoLang = pickFrom(autoKeys);
  if (autoLang) return { lang: autoLang, auto: true };

  return null;
}

async function fetchYtdlpJson(url: string): Promise<YtdlpJson> {
  const { stdout } = await runYtdlp(["--dump-single-json", "--skip-download", url]);
  return JSON.parse(stdout) as YtdlpJson;
}

export async function fetchMetadataViaOembed(
  url: string,
  videoId: string,
): Promise<VideoMetadata> {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    { next: { revalidate: 0 } },
  );
  if (!res.ok) {
    throw new Error("動画情報を取得できませんでした");
  }
  const data = (await res.json()) as {
    title?: string;
    thumbnail_url?: string;
  };
  return {
    id: videoId,
    title: data.title ?? "無題の動画",
    thumbnailUrl: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSec: 0,
  };
}

async function fetchVideoMetadataInternal(url: string): Promise<VideoMetadata> {
  const json = await fetchYtdlpJson(url);
  return {
    id: json.id,
    title: json.title ?? "無題の動画",
    thumbnailUrl: json.thumbnail ?? "",
    durationSec: json.duration ?? 0,
  };
}

function parseVtt(content: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = content.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;

    const startPart = timeLine.split("-->")[0]?.trim() ?? "0";
    const startSec = vttTimeToSeconds(startPart);
    const textLines = lines.filter(
      (l) => !l.includes("-->") && !/^\d+$/.test(l) && l !== "WEBVTT",
    );
    const text = textLines
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;

    const last = segments[segments.length - 1];
    if (last && last.text === text) continue;

    segments.push({ startSec, text });
  }

  return segments;
}

function vttTimeToSeconds(time: string): number {
  const parts = time.split(":");
  if (parts.length === 3) {
    return (
      Number(parts[0]) * 3600 +
      Number(parts[1]) * 60 +
      parseFloat(parts[2].replace(",", "."))
    );
  }
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + parseFloat(parts[1].replace(",", "."));
  }
  return parseFloat(time);
}

function pickSubtitleFile(dir: string, videoId: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const candidates = files.filter(
    (f) =>
      f.startsWith(videoId) &&
      (f.endsWith(".vtt") || f.endsWith(".srt") || f.endsWith(".json3")),
  );

  const score = (name: string): number => {
    if (/\.ja(\.|$)/i.test(name)) return 0;
    if (/\.ja-/i.test(name)) return 1;
    if (/\.en(\.|$)/i.test(name)) return 2;
    return 3;
  };

  candidates.sort((a, b) => score(a) - score(b));
  const picked = candidates[0];
  return picked ? path.join(dir, picked) : null;
}

function clearTempDir(tempDir: string, videoId: string): void {
  fs.mkdirSync(tempDir, { recursive: true });
  for (const file of fs.readdirSync(tempDir)) {
    if (file.startsWith(videoId)) {
      fs.unlinkSync(path.join(tempDir, file));
    }
  }
}

async function downloadSubtitleWithYtdlp(
  url: string,
  videoId: string,
  lang: string,
  auto: boolean,
  attempt: number,
): Promise<string | null> {
  const tempDir = path.join(getDataDir(), "temp", videoId);
  clearTempDir(tempDir, videoId);

  const outputBase = path.join(tempDir, videoId);
  const args = [
    "--skip-download",
    auto ? "--write-auto-subs" : "--write-subs",
    "--sub-langs",
    lang,
    "--sub-format",
    "vtt/best",
    "--convert-subs",
    "vtt",
    "-o",
    outputBase,
    url,
  ];

  try {
    await runYtdlp(args);
    return pickSubtitleFile(tempDir, videoId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const is429 =
      message.includes("429") || message.includes("Too Many Requests");

    if (is429 && attempt < 2) {
      await sleep(10_000 * attempt);
      return downloadSubtitleWithYtdlp(url, videoId, lang, auto, attempt + 1);
    }

    return null;
  }
}

async function fetchViaYoutubeTranscript(
  videoId: string,
): Promise<TranscriptSegment[]> {
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

  throw lastError ?? new Error("字幕 API から取得できませんでした");
}

async function fetchViaYtdlpSubtitles(
  url: string,
  videoId: string,
): Promise<TranscriptSegment[]> {
  try {
    const json = await fetchYtdlpJson(url);
    const picked = pickSubtitleLang(json.subtitles, json.automatic_captions);
    if (!picked) return [];

    const subPath = await downloadSubtitleWithYtdlp(
      url,
      videoId,
      picked.lang,
      picked.auto,
      1,
    );
    if (!subPath) return [];

    const raw = fs.readFileSync(subPath, "utf-8");
    return parseVtt(raw);
  } catch {
    return [];
  }
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("429") || message.includes("Too Many Requests")) {
    return "YouTube から一時的にアクセス制限（429）がかかっています。5〜10 分待ってから「字幕を再取得」を試してください。";
  }

  if (message.includes("Transcript is disabled")) {
    return "字幕を取得できませんでした（YouTube がクラウドサーバーからのアクセスを拒否している可能性があります）。";
  }

  if (message.includes("No transcripts are available")) {
    return "この動画には字幕トラックがありません。";
  }

  return message;
}

export async function fetchCaptions(url: string): Promise<CaptionsResult> {
  const normalized = normalizeYoutubeUrl(url);
  const videoId = extractYoutubeId(normalized)!;

  let metadata: VideoMetadata;
  try {
    metadata = await fetchVideoMetadataInternal(normalized);
  } catch {
    metadata = await fetchMetadataViaOembed(normalized, videoId);
  }

  let segments: TranscriptSegment[] = [];
  let transcriptError: unknown = null;

  // 主経路: youtube-transcript（拡張機能と同じ API。Cookie 不要・高速）
  try {
    segments = await fetchViaYoutubeTranscript(videoId);
  } catch (err) {
    transcriptError = err;
  }

  // フォールバック: yt-dlp で字幕ファイル取得（Vercel では不可）
  if (segments.length === 0 && isYtdlpAvailable()) {
    segments = await fetchViaYtdlpSubtitles(normalized, videoId);
  }

  if (segments.length === 0) {
    throw new Error(friendlyError(transcriptError));
  }

  return {
    metadata,
    segments,
    transcript: segmentsToTranscript(segments),
  };
}

export async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  const normalized = normalizeYoutubeUrl(url);
  const videoId = extractYoutubeId(normalized)!;
  try {
    return await fetchVideoMetadataInternal(normalized);
  } catch {
    return fetchMetadataViaOembed(normalized, videoId);
  }
}
