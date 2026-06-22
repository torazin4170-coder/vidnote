import type { SessionStatus } from "@/lib/schema";

export const STATUS_LABELS: Record<SessionStatus, string> = {
  pending: "待機中",
  fetching_captions: "字幕取得中",
  transcribed: "要約待ち",
  summarizing: "要約中",
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
    status === "summarizing"
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
      status === "summarizing" ||
      status === "done",
    summary: status === "done",
    processing: isProcessingStatus(status),
  };
}
