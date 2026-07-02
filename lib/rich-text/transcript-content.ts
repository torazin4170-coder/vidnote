import { escapeHtml } from "@/lib/rich-text/escape-html";

/** Legacy timestamp lines are normalized for display. */
export function normalizeTranscript(raw: string): string {
  const lines = raw.split("\n");
  const paragraphs: string[] = [];
  let current = "";

  const stripTimestamp = (line: string) =>
    line.replace(/^\d{1,2}:\d{2}(:\d{2})?\s*/, "").trim();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) {
        paragraphs.push(current.trim());
        current = "";
      }
      continue;
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      continue;
    }
    const text = stripTimestamp(trimmed);
    if (!text) continue;
    current += current ? ` ${text}` : text;
  }

  if (current) paragraphs.push(current.trim());
  return paragraphs.join("\n\n");
}

function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value.trim());
}

export function htmlToPlainTranscript(html: string): string {
  if (!html.trim()) return "";
  if (!looksLikeHtml(html)) return html;

  return html
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>\s*<li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripTranscriptFormatting(value: string): string {
  if (!value.trim()) return "";
  return normalizeTranscript(htmlToPlainTranscript(value));
}

export function transcriptToEditorHtml(raw: string | null | undefined): string {
  if (!raw?.trim()) return "<p></p>";
  if (looksLikeHtml(raw)) return raw;

  const normalized = normalizeTranscript(raw);
  const paragraphs = normalized.split("\n\n").filter(Boolean);
  if (paragraphs.length === 0) return "<p></p>";
  if (paragraphs.length > 150) {
    return `<p>${escapeHtml(normalized).replace(/\n\n/g, "<br><br>")}</p>`;
  }
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
}
