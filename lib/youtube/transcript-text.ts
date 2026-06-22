export type TranscriptSegment = {
  startSec: number;
  text: string;
};

export function segmentsToTranscript(segments: TranscriptSegment[]): string {
  if (segments.length === 0) return "";

  const paragraphs: string[] = [];
  let current = segments[0]!.text;

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]!;
    const prev = segments[i - 1]!;
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
