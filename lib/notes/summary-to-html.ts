import { SUMMARY_SECTION_LABELS } from "@/lib/labels";
import { escapeHtml } from "@/lib/rich-text/escape-html";
import type { SummarySections } from "@/lib/schema";

/** AI 要点ペイン用: 概要と用語のみ */
export function buildSummaryDisplayHtml(summary: SummarySections): string {
  const parts: string[] = [];

  if (summary.overview.trim()) {
    parts.push(
      `<h3>${escapeHtml(SUMMARY_SECTION_LABELS.overview)}</h3>`,
      `<p>${escapeHtml(summary.overview)}</p>`,
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
