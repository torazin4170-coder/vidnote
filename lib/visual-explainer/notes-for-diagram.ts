import { htmlToPlainTranscript } from "@/lib/rich-text/transcript-content";

/** 図解プロンプトに載せるマイノートの上限（トークン超過防止） */
export const NOTES_EXCERPT_LIMIT = 8_000;

export function notesHtmlToPlainExcerpt(
  notesHtml: string | null | undefined,
  limit = NOTES_EXCERPT_LIMIT,
): string | null {
  const plain = htmlToPlainTranscript(notesHtml ?? "").trim();
  if (!plain) return null;
  if (plain.length <= limit) return plain;
  return `${plain.slice(0, limit)}\n\n（以下省略）`;
}
