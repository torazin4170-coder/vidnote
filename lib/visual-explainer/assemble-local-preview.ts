/** file:// プレビュー用: base.html の CSS パスを diagram-workspace からの相対パスに差し替える */
export function toLocalPreviewHtml(assembledHtml: string): string {
  return assembledHtml.replace(
    'href="/visual-explainer/diagram.css"',
    'href="../../public/visual-explainer/diagram.css"',
  );
}
