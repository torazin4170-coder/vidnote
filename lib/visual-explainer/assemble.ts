import fs from "node:fs";
import path from "node:path";

const BASE_PATH = path.join(process.cwd(), "lib/visual-explainer/base.html");

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function assembleVisualExplainerHtml(input: {
  title: string;
  description: string;
  content: string;
}): string {
  const template = fs.readFileSync(BASE_PATH, "utf8");
  const contentBlock = `<!-- CONTENT_START -->\n${input.content.trim()}\n<!-- CONTENT_END -->`;

  return template
    .replace(/<!-- TITLE -->/g, escapeHtml(input.title))
    .replace(/<!-- DESCRIPTION -->/g, escapeHtml(input.description))
    .replace(
      /<!-- CONTENT_START -->\s*\n\s*<!-- CONTENT_END -->/,
      contentBlock,
    );
}
