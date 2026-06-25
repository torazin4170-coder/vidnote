/**
 * Shared paragraph formatting for YouTube transcript segments.
 * Mirrors lib/youtube/transcript-text.ts segmentsToTranscript().
 */

/**
 * @param {{ offset: number, text: string }[]} items - youtube-transcript items (offset in ms)
 */
export function youtubeItemsToTranscript(items) {
  if (!items.length) return "";

  const segments = items.map((item) => ({
    startSec: item.offset / 1000,
    text: item.text.trim(),
  }));

  return segmentsToTranscript(segments);
}

/**
 * @param {{ startSec: number, text: string }[]} segments
 */
export function segmentsToTranscript(segments) {
  if (segments.length === 0) return "";

  const paragraphs = [];
  let current = segments[0].text;

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const prev = segments[i - 1];
    const gap = seg.startSec - prev.startSec;

    if (gap >= 3) {
      paragraphs.push(current.trim());
      current = seg.text;
    } else {
      current += seg.text.startsWith(" ") ? seg.text : ` ${seg.text}`;
    }
  }

  paragraphs.push(current.trim());
  return paragraphs.join("\n\n");
}
