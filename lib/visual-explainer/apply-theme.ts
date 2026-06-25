import type { VisualExplainerTheme } from "@/lib/visual-explainer/theme";

export function applyThemeToVisualExplainerHtml(
  html: string,
  theme: VisualExplainerTheme,
): string {
  let result = html.replace(/<html([^>]*)\sclass="dark"([^>]*)>/, "<html$1$2>");

  if (theme === "dark") {
    if (/<html[^>]*class="/i.test(result)) {
      result = result.replace(
        /<html([^>]*?)class="([^"]*)"/i,
        '<html$1class="$2 dark"',
      );
    } else {
      result = result.replace(
        '<html lang="ja">',
        '<html lang="ja" class="dark">',
      );
    }

    if (!result.includes("visual-explainer-theme-vars")) {
      result = result.replace("</head>", `${DARK_MODE_CSS}</head>`);
    }
  }

  return result;
}

const DARK_MODE_CSS = `<style id="visual-explainer-theme-vars">
:root {
  --ads-bg: #ffffff;
  --ads-surface: #f8fafc;
  --ads-hover: #f1f5f9;
  --ads-border: #e2e8f0;
  --ads-text: #1e293b;
  --ads-muted: #64748b;
  --ads-dim: #94a3b8;
}
html.dark {
  --ads-bg: #0f172a;
  --ads-surface: #1e293b;
  --ads-hover: #334155;
  --ads-border: #334155;
  --ads-text: #e2e8f0;
  --ads-muted: #94a3b8;
  --ads-dim: #64748b;
}
html.dark,
html.dark body {
  background-color: var(--ads-bg) !important;
  color: var(--ads-muted) !important;
}
html.dark .bg-ads-bg,
html.dark .bg-white {
  background-color: var(--ads-bg) !important;
}
html.dark .bg-ads-surface,
html.dark .bg-slate-50,
html.dark .bg-slate-100 {
  background-color: var(--ads-surface) !important;
}
html.dark .bg-ads-hover,
html.dark .bg-slate-200 {
  background-color: var(--ads-hover) !important;
}
html.dark .text-ads-text,
html.dark .text-slate-800,
html.dark .text-slate-700,
html.dark .text-slate-600 {
  color: var(--ads-text) !important;
}
html.dark .text-ads-muted,
html.dark .text-slate-500 {
  color: var(--ads-muted) !important;
}
html.dark .text-ads-dim,
html.dark .text-slate-400 {
  color: var(--ads-dim) !important;
}
html.dark .border-ads-border,
html.dark .border-slate-200,
html.dark .border-slate-300,
html.dark .border-gray-200 {
  border-color: var(--ads-border) !important;
}
</style>`;
