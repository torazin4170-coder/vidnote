import { youtubeThumbnailUrl } from "@/lib/youtube/parse-url";

export type BrowserVideoMetadata = {
  title: string | null;
  thumbnailUrl: string;
};

export async function fetchVideoMetadataInBrowser(
  url: string,
  videoId: string,
): Promise<BrowserVideoMetadata> {
  const fallback = {
    title: null,
    thumbnailUrl: youtubeThumbnailUrl(videoId),
  };

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (!res.ok) return fallback;

    const data = (await res.json()) as {
      title?: string;
      thumbnail_url?: string;
    };

    return {
      title: data.title ?? null,
      thumbnailUrl: data.thumbnail_url ?? fallback.thumbnailUrl,
    };
  } catch {
    return fallback;
  }
}
