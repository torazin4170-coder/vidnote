import { assembleVisualExplainerHtml } from "@/lib/visual-explainer/assemble";
import { fixChartBarScales } from "@/lib/visual-explainer/fix-chart-bars";

const ASSEMBLED_MARKERS = ["visual-explainer-theme-vars", "CONTENT_START"];

export function extractDiagramContent(rawHtml: string): string {
  const trimmed = rawHtml.trim();
  const fenced = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const contentBlock = trimmed.match(
    /<!-- CONTENT_START -->\s*([\s\S]*?)\s*<!-- CONTENT_END -->/i,
  );
  if (contentBlock?.[1]) return contentBlock[1].trim();

  const mainMatch = trimmed.match(/<main[\s\S]*?<\/main>/i);
  if (mainMatch?.[0]) {
    return mainMatch[0]
      .replace(/^<main[^>]*>/i, "")
      .replace(/<\/main>$/i, "")
      .trim();
  }

  const bodyMatch = trimmed.match(/<body[\s\S]*?<\/body>/i);
  if (bodyMatch?.[0]) {
    return bodyMatch[0]
      .replace(/^<body[^>]*>/i, "")
      .replace(/<\/body>$/i, "")
      .trim();
  }

  return trimmed;
}

export function isAssembledVisualExplainerHtml(html: string): boolean {
  return ASSEMBLED_MARKERS.every((marker) => html.includes(marker));
}

export function isPlaceholderDiagramHtml(html: string): boolean {
  const normalized = html.replace(/\s+/g, " ").trim();
  return (
    normalized.includes("Cursor で生成した図解 HTML をこのファイルに保存") ||
    normalized.length < 120
  );
}

export function prepareImportedDiagramHtml(input: {
  rawHtml: string;
  title: string;
  description?: string | null;
}): string {
  const raw = input.rawHtml.trim();
  if (!raw) {
    throw new Error("図解 HTML が空です");
  }
  if (isPlaceholderDiagramHtml(raw)) {
    throw new Error("diagram.html がまだ Cursor で生成されていません");
  }

  if (isAssembledVisualExplainerHtml(raw)) {
    return fixChartBarScales(raw);
  }

  const content = extractDiagramContent(raw);
  if (!content.includes("data-lucide")) {
    throw new Error(
      "図解 HTML に Lucide アイコン（data-lucide）が見つかりません。Cursor の出力形式を確認してください。",
    );
  }

  const description =
    input.description?.trim() ||
    content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) ||
    input.title;

  return assembleVisualExplainerHtml({
    title: input.title,
    description,
    content: fixChartBarScales(content),
  });
}

export type SessionTargetFile = {
  sessionId: string;
  title?: string | null;
  updatedAt?: string;
};

export function parseSessionTargetJson(raw: string): SessionTargetFile {
  const parsed = JSON.parse(raw) as SessionTargetFile;
  const sessionId = parsed.sessionId?.trim();
  if (!sessionId) {
    throw new Error("session.target.json に sessionId がありません");
  }
  return {
    sessionId,
    title: parsed.title ?? null,
    updatedAt: parsed.updatedAt,
  };
}

export function buildSessionTargetJson(input: {
  sessionId: string;
  title?: string | null;
}): string {
  return `${JSON.stringify(
    {
      sessionId: input.sessionId,
      title: input.title ?? null,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`;
}
