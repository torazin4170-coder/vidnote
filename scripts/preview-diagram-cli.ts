import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toLocalPreviewHtml } from "@/lib/visual-explainer/assemble-local-preview";
import { prepareImportedDiagramHtml } from "@/lib/visual-explainer/import-diagram";
import { openLocalHtmlFile } from "@/lib/visual-explainer/open-browser";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diagramPath = path.join(root, "diagram-workspace", "output", "diagram.html");
const previewPath = path.join(root, "diagram-workspace", "output", "diagram.preview.html");

function extractTitle(rawHtml: string): string {
  const h1 = rawHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) {
    return h1[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const titleTag = rawHtml.match(/<title>([^<]+)<\/title>/i);
  if (titleTag?.[1]) return titleTag[1].trim();
  return "VidNote 図解";
}

function main(): void {
  if (!fs.existsSync(diagramPath)) {
    console.error(`diagram.html がありません: ${diagramPath}`);
    process.exit(1);
  }

  const rawHtml = fs.readFileSync(diagramPath, "utf8");
  const title = extractTitle(rawHtml);

  const assembled = prepareImportedDiagramHtml({
    rawHtml,
    title,
    description: title,
  });
  const previewHtml = toLocalPreviewHtml(assembled);
  fs.writeFileSync(previewPath, previewHtml, "utf8");

  console.log(`Preview written: ${previewPath}`);
  console.log("Opening in browser (dark mode toggle included)...");
  openLocalHtmlFile(previewPath);
}

main();
