import type { SummarySections } from "@/lib/schema";

const TRANSCRIPT_EXCERPT_LIMIT = 12_000;

export type CopyPromptMode = "cursor" | "notebooklm";

function formatSummary(summary: SummarySections): string {
  const lines = [
    "## 概要",
    summary.overview,
    "",
    "## 重要ポイント",
    ...summary.keyPoints.map((point) => `- ${point}`),
    "",
    "## 用語",
    ...summary.terms.map((term) => `- ${term.term}: ${term.definition}`),
    "",
    "## アクション",
    ...summary.actions.map((action) => `- ${action}`),
  ];
  return lines.join("\n");
}

export function buildVisualExplainerCopyText(input: {
  title: string;
  summary: SummarySections;
  transcript?: string | null;
  mode: CopyPromptMode;
}): string {
  const title = input.title.trim() || "（タイトルなし）";
  const summaryText = formatSummary(input.summary);

  if (input.mode === "notebooklm") {
    return [
      "以下の YouTube 動画の要点を、初めて聞く人にもわかる図解（インフォグラフィック）にしてください。",
      "",
      `# ${title}`,
      "",
      summaryText,
    ].join("\n");
  }

  const transcriptExcerpt = input.transcript?.trim().slice(0, TRANSCRIPT_EXCERPT_LIMIT);
  const transcriptBlock = transcriptExcerpt
    ? ["", "## 字幕（参考・抜粋）", transcriptExcerpt].join("\n")
    : "";

  return [
    "以下の YouTube 動画の内容を、creating-visual-explainers の図解 HTML 形式で図解してください。",
    "Tailwind CSS クラスと Lucide Icons のみを使い、<main> 内のコンテンツ断片として出力してください。",
    "",
    `# ${title}`,
    "",
    summaryText,
    transcriptBlock,
  ].join("\n");
}
