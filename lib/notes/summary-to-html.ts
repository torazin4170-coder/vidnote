import { SUMMARY_SECTION_LABELS } from "@/lib/labels";
import { escapeHtml } from "@/lib/rich-text/escape-html";
import type { SummarySections } from "@/lib/schema";

/**
 * \n\n で区切られた段落を複数の <p> に変換し、
 * 段落内の \n は <br> にする。
 */
function textToHtmlParagraphs(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const inner = escapeHtml(para.trim()).replace(/\n/g, "<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

/** AI 要点ペイン用: 概要と用語のみ */
export function buildSummaryDisplayHtml(summary: SummarySections): string {
  const parts: string[] = [];

  if (summary.overview.trim()) {
    parts.push(
      `<h3>${escapeHtml(SUMMARY_SECTION_LABELS.overview)}</h3>`,
      textToHtmlParagraphs(summary.overview),
    );
  }

  if (summary.terms.length > 0) {
    const listItems = summary.terms
      .map(
        (t) =>
          `<li><strong>${escapeHtml(t.term)}</strong> — ${escapeHtml(t.definition)}</li>`,
      )
      .join("");
    parts.push(
      `<h3>${escapeHtml(SUMMARY_SECTION_LABELS.terms)}</h3>`,
      `<ul>${listItems}</ul>`,
    );
  }

  return parts.join("");
}
