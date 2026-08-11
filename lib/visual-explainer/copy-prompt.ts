import type { SummarySections } from "@/lib/schema";
import { notesHtmlToPlainExcerpt } from "@/lib/visual-explainer/notes-for-diagram";

const TRANSCRIPT_EXCERPT_LIMIT = 12_000;

export type CopyPromptMode = "cursor" | "notebooklm";

function formatSummaryForDiagram(summary: SummarySections): string {
  const lines = [
    "## 概要",
    summary.overview,
    "",
    "## 重要ポイント",
    ...summary.keyPoints.map((point) => `- ${point}`),
  ];

  if (summary.frameworkViews.length > 0) {
    lines.push("", "## 構造的整理（図解レイアウトの参考・テンプレ強制しない）");
    for (const view of summary.frameworkViews) {
      lines.push("", `### ${view.framework}: ${view.title}`);
      lines.push(...view.items.map((item) => `- ${item}`));
    }
  }

  lines.push(
    "",
    "## 用語",
    ...summary.terms.map((term) => `- ${term.term}: ${term.definition}`),
    "",
    "## アクション",
    ...summary.actions.map((action) => `- ${action}`),
  );
  return lines.join("\n");
}

export function buildVisualExplainerCopyText(input: {
  title: string;
  summary: SummarySections;
  transcript?: string | null;
  notesHtml?: string | null;
  mode: CopyPromptMode;
}): string {
  const title = input.title.trim() || "（タイトルなし）";
  const summaryText = formatSummaryForDiagram(input.summary);
  const notesExcerpt = notesHtmlToPlainExcerpt(input.notesHtml);
  const notesBlock = notesExcerpt
    ? ["", "## マイノート（学習者の整理・図解に必ず反映）", notesExcerpt].join("\n")
    : "";

  if (input.mode === "notebooklm") {
    const intro = [
      "以下の YouTube 動画の要点を、初めて聞く人にもわかる図解（インフォグラフィック）にしてください。",
      notesExcerpt
        ? "マイノートに学習者が追記した内容がある場合は、AI 要点と同等以上に重視して図解に反映してください。"
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    return [intro, "", `# ${title}`, "", summaryText, notesBlock]
      .filter((part) => part !== "")
      .join("\n");
  }

  const transcriptExcerpt = input.transcript?.trim().slice(0, TRANSCRIPT_EXCERPT_LIMIT);
  const transcriptBlock = transcriptExcerpt
    ? ["", "## 字幕（参考・抜粋）", transcriptExcerpt].join("\n")
    : "";

  const intro = [
    "以下の YouTube 動画の内容を、VidNote 図解 HTML 形式で図解してください。",
    notesExcerpt
      ? "マイノートに学習者が追記・整理した内容がある場合は、AI 要点と矛盾する箇所はマイノートを優先し、図解の構成・強調・例に反映してください。"
      : null,
    "Tailwind CSS クラスと Lucide Icons のみを使い、<main> 内のコンテンツ断片として出力してください（<main> タグ・DOCTYPE・head・body は含めない）。",
    "ダークモード切り替えはシェルが自動付与するため、図解 HTML に含めないこと。",
    "本文の強調は font-bold text-ads-text（太字）を基本とし、色付き span はセクション全体で0〜2箇所に抑えること。",
    "参考トーン: https://ads_lecture_4_diagram.surge.sh/ （色はカード構造・見出しに使い、本文は控えめ）",
    "数値・割合・比較データがあればプログレスバーまたは横棒グラフで視覚化すること。",
    "frameworkViews があれば図解の参考にするが、5W1H・マトリクス等の型に毎回合わせる必要はない。動画内容に最適なレイアウトを選ぶこと。",
    "セクションごとに番号バッジ＋問いかけサブタイトル＋左右対比/グラフ/引用ボックス等のビジュアルパターンを使うこと。",
    "完成 HTML は diagram-workspace/output/diagram.html に保存し、保存後 npm run diagram:preview を実行してブラウザでプレビューすること。VidNote への反映はユーザーが「HTML を取り込む」から手動で行う。",
  ]
    .filter(Boolean)
    .join("\n");

  return [intro, "", `# ${title}`, "", summaryText, notesBlock, transcriptBlock]
    .filter((part) => part !== "")
    .join("\n");
}
