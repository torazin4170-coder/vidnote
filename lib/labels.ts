import type { SessionStatus } from "@/lib/schema";

export const STATUS_LABELS: Record<SessionStatus, string> = {
  pending: "待機中",
  fetching_captions: "字幕取得中",
  polishing_transcript: "字幕校正中",
  transcribed: "要約待ち",
  summarizing: "要約中",
  generating_diagram: "図解生成中",
  done: "完了",
  error: "エラー",
};

export const SUMMARY_SECTION_LABELS = {
  overview: "概要",
  keyPoints: "重要ポイント",
  terms: "用語",
  actions: "アクション",
} as const;

export function isProcessingStatus(status: SessionStatus): boolean {
  return (
    status === "pending" ||
    status === "fetching_captions" ||
    status === "polishing_transcript" ||
    status === "summarizing" ||
    status === "generating_diagram"
  );
}

export function sessionStatusIcons(status: SessionStatus): {
  caption: boolean;
  summary: boolean;
  processing: boolean;
} {
  return {
    caption:
      status === "transcribed" ||
      status === "polishing_transcript" ||
      status === "summarizing" ||
      status === "generating_diagram" ||
      status === "done",
    summary: status === "done",
    processing: isProcessingStatus(status),
  };
}
