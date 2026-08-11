import { escapeHtml } from "@/lib/rich-text/escape-html";

export const CRITICAL_THINKING_MARKER = "<!-- vidnote:critical-thinking -->";
export const CRITICAL_THINKING_TITLE = "批判的視点（AI）";

function plainSectionToNotesHtml(plain: string): string {
  const lines = plain.split("\n");
  const parts: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    parts.push(
      `<ul>${listItems
        .map((item) => {
          const segments = item
            .split("\n")
            .map((segment) => segment.trim())
            .filter(Boolean)
            .map(escapeHtml);
          return `<li>${segments.join("<br/>")}</li>`;
        })
        .join("")}</ul>`,
    );
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      if (parts.length > 0) {
        parts.push("<p><br></p>");
      }
      parts.push(`<h3>${escapeHtml(trimmed.slice(3))}</h3>`);
      continue;
    }
    if (/^[-•]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-•]\s+/, ""));
      continue;
    }
    if (listItems.length > 0) {
      listItems[listItems.length - 1] += `\n${trimmed}`;
      continue;
    }
    flushList();
    parts.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  flushList();
  return parts.join("");
}

export function buildCriticalThinkingBlock(plain: string): string {
  const body = plainSectionToNotesHtml(plain.trim());
  if (!body) return "";
  return `${CRITICAL_THINKING_MARKER}<h3>${escapeHtml(CRITICAL_THINKING_TITLE)}</h3>${body}`;
}

export function appendCriticalThinkingToNotes(
  existingNotesHtml: string | null | undefined,
  plain: string,
): string {
  const block = buildCriticalThinkingBlock(plain);
  if (!block) return existingNotesHtml?.trim() ?? "";

  const existing = existingNotesHtml?.trim() ?? "";
  const markerIndex = existing.indexOf(CRITICAL_THINKING_MARKER);

  if (markerIndex >= 0) {
    return `${existing.slice(0, markerIndex)}${block}`;
  }

  return existing ? `${existing}<p><br></p>${block}` : block;
}
