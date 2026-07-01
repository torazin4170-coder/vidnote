/** この秒数以上は VidNote 内の自動図解より Cursor 図解を推奨（既定 45 分） */
export const LONG_VIDEO_CURSOR_DIAGRAM_SEC = 45 * 60;

export function recommendCursorDiagram(
  durationSec: number | null | undefined,
): boolean {
  if (durationSec == null || durationSec <= 0) return false;
  return durationSec >= LONG_VIDEO_CURSOR_DIAGRAM_SEC;
}

export function formatLongVideoThresholdMinutes(): number {
  return LONG_VIDEO_CURSOR_DIAGRAM_SEC / 60;
}
