import { escapeHtml } from "@/lib/rich-text/escape-html";

/**
 * AI 要約テキストを画面用に整える。
 * JSON 文字列内の改行漏れ・リテラル \\n を段落に変換する。
 */

export function normalizeSummaryText(text: string): string {
  let s = text.replace(/\r\n/g, "\n").replace(/\\n/g, "\n").trim();
  if (!s) return s;

  s = s.replace(/(?<!^)(?<!\n)\s+(?=\d+[.)．]\s)/g, "\n\n");

  if (s.includes("\n")) return s;
  if (s.length < 160) return s;

  const sentences = s.split(/(?<=[。！？!?])\s*/).filter(Boolean);
  if (sentences.length < 3) return s;

  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paras.push(sentences.slice(i, i + 2).join(""));
  }
  return paras.join("\n\n");
}

/** \n\n で区切られた段落を複数の <p> に変換し、段落内の \n は <br> にする。 */
export function textToHtmlParagraphs(text: string): string {
  return normalizeSummaryText(text)
    .split(/\n{2,}/)
    .map((para) => {
      const inner = escapeHtml(para.trim()).replace(/\n/g, "<br>");
      return `<p>${inner}</p>`;
    })
    .filter((p) => p !== "<p></p>")
    .join("");
}

export function textToHtmlInlineBreaks(text: string): string {
  return escapeHtml(normalizeSummaryText(text)).replace(/\n/g, "<br>");
}
