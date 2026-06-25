import { NextResponse } from "next/server";

import { getSessionDiagramHtml } from "@/lib/db/sessions";
import { applyThemeToVisualExplainerHtml } from "@/lib/visual-explainer/apply-theme";
import { optimizeDiagramHtmlForBrowser } from "@/lib/visual-explainer/optimize-html";
import type { VisualExplainerTheme } from "@/lib/visual-explainer/theme";

type RouteContext = { params: Promise<{ id: string }> };

function parseTheme(value: string | null): VisualExplainerTheme {
  return value === "dark" ? "dark" : "light";
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
    applyThemeToVisualExplainerHtml(html, theme),
  );

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
