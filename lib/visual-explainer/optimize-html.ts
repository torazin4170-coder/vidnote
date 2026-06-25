const TAILWIND_CDN_PATTERN =
  /<script[^>]*src="https:\/\/cdn\.tailwindcss\.com"[^>]*><\/script>\s*/gi;

const TAILWIND_CONFIG_PATTERN =
  /<script>\s*tailwind\.config\s*=[\s\S]*?<\/script>\s*/i;

const DIAGRAM_CSS_HREF = "/visual-explainer/diagram.css";

export function optimizeDiagramHtmlForBrowser(html: string): string {
  let result = html.replace(TAILWIND_CDN_PATTERN, "");
  result = result.replace(TAILWIND_CONFIG_PATTERN, "");

  if (!result.includes(DIAGRAM_CSS_HREF)) {
    result = result.replace(
      "</head>",
      `  <link rel="stylesheet" href="${DIAGRAM_CSS_HREF}">\n</head>`,
    );
  }

  return result;
}
