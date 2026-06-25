import type { VisualExplainerTheme } from "@/lib/visual-explainer/theme";

export function buildVisualExplainerUrl(
  sessionId: string,
  theme: VisualExplainerTheme = "light",
): string {
  const params = new URLSearchParams({ theme });
  return `/api/sessions/${encodeURIComponent(sessionId)}/diagram?${params}`;
}

/** ユーザー操作の直後（非同期前）に呼ぶ。生成完了後に navigateVisualExplainerTab で URL を差し替える */
export function prepareVisualExplainerTab(): Window | null {
  return window.open("about:blank", "_blank");
}

export function navigateVisualExplainerTab(
  tab: Window | null,
  sessionId: string,
  theme: VisualExplainerTheme = "light",
): boolean {
  const url = buildVisualExplainerUrl(sessionId, theme);
  if (tab && !tab.closed) {
    tab.location.href = url;
    return true;
  }
  return window.open(url, "_blank") != null;
}

export function closeVisualExplainerTab(tab: Window | null): void {
  if (tab && !tab.closed) {
    tab.close();
  }
}

export function openVisualExplainerInNewTab(
  sessionId: string,
  theme: VisualExplainerTheme = "light",
): Window | null {
  const url = buildVisualExplainerUrl(sessionId, theme);
  return window.open(url, "_blank");
}
