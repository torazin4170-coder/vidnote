import http from "node:http";
import { YoutubeTranscript } from "youtube-transcript";

import { youtubeItemsToTranscript } from "./transcript-format.mjs";

const PORT = Number(process.env.TRANSCRIPT_RELAY_PORT ?? 8787);
const SECRET = process.env.TRANSCRIPT_RELAY_SECRET?.trim() ?? "";

async function fetchTranscript(videoId) {
  const langs = ["ja", "ja-JP", "en", "en-US"];
  for (const lang of langs) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      if (items.length > 0) return youtubeItemsToTranscript(items);
    } catch {
      // try next lang
    }
  }
  const items = await YoutubeTranscript.fetchTranscript(videoId);
  if (items.length === 0) throw new Error("字幕を取得できませんでした");
  return youtubeItemsToTranscript(items);
}

async function fetchMetadata(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (!res.ok) throw new Error("oembed failed");
    const data = await res.json();
    return {
      title: data.title ?? null,
      thumbnailUrl:
        data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return {
      title: null,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/transcript") {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (SECRET) {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${SECRET}`) {
      res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw);
    const videoId = String(body.videoId ?? "").trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "videoId が不正です" }));
      return;
    }

    const [transcript, metadata] = await Promise.all([
      fetchTranscript(videoId),
      fetchMetadata(videoId),
    ]);

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        transcript,
        title: metadata.title,
        thumbnailUrl: metadata.thumbnailUrl,
        durationSec: null,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "字幕取得に失敗しました";
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(PORT, () => {
  console.log(`VidNote transcript relay listening on http://127.0.0.1:${PORT}`);
  console.log("POST /transcript  { \"videoId\": \"xxxxxxxxxxx\" }");
  if (SECRET) console.log("Authorization: Bearer <TRANSCRIPT_RELAY_SECRET>");
});
