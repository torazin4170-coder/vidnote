import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession, getSessionDiagramHtml, updateSession } from "@/lib/db/sessions";
import { sanitizeSessionForClient } from "@/lib/session-list";
import { applyThemeToVisualExplainerHtml } from "@/lib/visual-explainer/apply-theme";
import { fixChartBarScales } from "@/lib/visual-explainer/fix-chart-bars";
import type { SummarySections } from "@/lib/schema";
import { prepareImportedDiagramHtml } from "@/lib/visual-explainer/import-diagram";
import { optimizeDiagramHtmlForBrowser } from "@/lib/visual-explainer/optimize-html";
import type { VisualExplainerTheme } from "@/lib/visual-explainer/theme";

type RouteContext = { params: Promise<{ id: string }> };

const importSchema = z.object({
  html: z.string().min(1),
});

function parseTheme(value: string | null): VisualExplainerTheme {
  return value === "dark" ? "dark" : "light";
}

function descriptionFromSummary(
  summary: SummarySections | null,
): string | null {
  return summary?.overview?.trim().slice(0, 160) ?? null;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const html = await getSessionDiagramHtml(id);

  if (!html) {
    return NextResponse.json(
      { error: "図解が見つかりません" },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const theme = parseTheme(url.searchParams.get("theme"));
  const body = optimizeDiagramHtmlForBrowser(
    fixChartBarScales(applyThemeToVisualExplainerHtml(html, theme)),
  );

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }

  try {
    const body = importSchema.parse(await request.json());
    const title = session.title?.trim() || session.youtubeUrl;
    const html = prepareImportedDiagramHtml({
      rawHtml: body.html,
      title,
      description: descriptionFromSummary(session.summaryJson),
    });

    const updated = await updateSession(id, {
      visualExplainerHtml: html,
      status: "done",
      errorMessage: null,
    });

    return NextResponse.json({
      session: updated ? sanitizeSessionForClient(updated) : null,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "図解の取り込みに失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
