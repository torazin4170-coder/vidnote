import { SUMMARY_SECTION_LABELS } from "@/lib/labels";
import { escapeHtml } from "@/lib/rich-text/escape-html";
import type { SummarySections } from "@/lib/schema";

export const AUTO_SUMMARY_MARKER = "<!-- vidnote:auto-summary -->";

function buildListSection(title: string, items: string[]): string {
  if (items.length === 0) return "";
  const listItems = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<h3>${escapeHtml(title)}</h3><ul>${listItems}</ul>`;
}

function buildAutoSummaryBlock(summary: SummarySections): string {
  const sections = [
    buildListSection(SUMMARY_SECTION_LABELS.keyPoints, summary.keyPoints),
    buildListSection(SUMMARY_SECTION_LABELS.actions, summary.actions),
  ].filter(Boolean);

  if (sections.length === 0) return "";
  return `${AUTO_SUMMARY_MARKER}${sections.join("")}`;
}

export function appendSummarySectionsToNotes(
  existingNotesHtml: string | null | undefined,
  summary: SummarySections,
): string {
  const block = buildAutoSummaryBlock(summary);
  if (!block) return existingNotesHtml?.trim() ?? "";

  const existing = existingNotesHtml?.trim() ?? "";
  const markerIndex = existing.indexOf(AUTO_SUMMARY_MARKER);

  if (markerIndex >= 0) {
    return `${existing.slice(0, markerIndex)}${block}`;
  }

  return existing ? `${existing}${block}` : block;
}
