/**
 * YouTube 字幕を取得し、応答が要求した動画自身のものであることを確認する。
 * ライブラリの InnerTube 応答を無検証で使うと、失敗時に別動画の字幕が返ることがある。
 */

const PLAYER_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const IOS_UA =
  "com.google.ios.youtube/20.10.38 (iPhone16,2; U; CPU iOS 18_0 like Mac OS X)";

function wrongVideoError(requested, actual) {
  const err = new Error(
    `字幕の取得先が別の動画でした（要求 ${requested} / 応答 ${actual}）。もう一度「字幕を再取得」を試してください。`,
  );
  err.code = "WRONG_VIDEO";
  return err;
}

function videoIdFromTrack(track) {
  try {
    return new URL(track.baseUrl).searchParams.get("v");
  } catch {
    return null;
  }
}

function assertTracksBelongToVideo(videoId, data, tracks) {
  const returned = data?.videoDetails?.videoId;
  if (typeof returned === "string" && returned !== videoId) {
    throw wrongVideoError(videoId, returned);
  }
  for (const track of tracks) {
    const trackVideoId = videoIdFromTrack(track);
    if (trackVideoId && trackVideoId !== videoId) {
      throw wrongVideoError(videoId, trackVideoId);
    }
  }
}

function pickTrack(tracks) {
  const preferred = ["ja", "en"];
  const score = (track) => {
    const lang = String(track.languageCode ?? "");
    const base = lang.split("-")[0];
    const langRank = preferred.indexOf(base);
    const rank = langRank === -1 ? preferred.length : langRank;
    const autoPenalty = track.kind === "asr" ? 1 : 0;
    return rank * 2 + autoPenalty;
  };
  return [...tracks].sort((a, b) => score(a) - score(b))[0];
}

function decodeXml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseJson3(body) {
  const data = JSON.parse(body);
  const items = [];
  for (const event of data.events ?? []) {
    if (!Array.isArray(event.segs) || event.tStartMs == null) continue;
    const text = event.segs
      .map((seg) => seg.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    items.push({ offset: Number(event.tStartMs), text });
  }
  return items;
}

function parseXml(xml) {
  const items = [];
  const pRegex = /<p\s+t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const inner = match[2];
    let text = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) text = inner.replace(/<[^>]+>/g, "");
    text = decodeXml(text).replace(/\s+/g, " ").trim();
    if (text) items.push({ offset: parseInt(match[1], 10), text });
  }
  if (items.length > 0) return items;

  const classic = /<text start="([^"]*)"[^>]*>([^<]*)<\/text>/g;
  while ((match = classic.exec(xml)) !== null) {
    const text = decodeXml(match[2]).replace(/\s+/g, " ").trim();
    if (text) {
      items.push({ offset: Math.round(parseFloat(match[1]) * 1000), text });
    }
  }
  return items;
}

async function fetchPlayer(videoId) {
  const res = await fetch(PLAYER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": IOS_UA,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "IOS",
          clientVersion: "20.10.38",
          deviceMake: "Apple",
          deviceModel: "iPhone16,2",
          hl: "ja",
          gl: "JP",
        },
      },
      videoId,
    }),
  });
  if (!res.ok) {
    throw new Error(`YouTube player API が HTTP ${res.status} を返しました`);
  }
  return res.json();
}

async function fetchTrackItems(track) {
  const url = new URL(track.baseUrl);
  url.searchParams.set("fmt", "json3");
  const res = await fetch(url, {
    headers: { "User-Agent": IOS_UA },
  });
  if (!res.ok) {
    throw new Error(`字幕データの取得に失敗しました（HTTP ${res.status}）`);
  }
  const body = await res.text();
  if (body.trim().startsWith("{") || body.trim().startsWith("[")) {
    const items = parseJson3(body);
    if (items.length > 0) return items;
  }
  const xmlItems = parseXml(body);
  if (xmlItems.length > 0) return xmlItems;
  throw new Error("字幕データが空でした");
}

/**
 * @param {string} videoId
 * @returns {Promise<{ offset: number, text: string }[]>} offset はミリ秒
 */
export async function fetchVerifiedTranscriptItems(videoId) {
  const data = await fetchPlayer(videoId);
  const tracks =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error("この動画には字幕トラックがありません");
  }
  assertTracksBelongToVideo(videoId, data, tracks);
  const items = await fetchTrackItems(pickTrack(tracks));
  if (items.length === 0) {
    throw new Error("字幕を取得できませんでした");
  }
  return items;
}
