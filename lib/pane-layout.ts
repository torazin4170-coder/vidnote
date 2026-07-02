export const PANE_LAYOUT_STORAGE_KEY = "vidnote-pane-layout";

export type PaneLayout = {
  libraryWidth: number;
  sourceWidth: number;
  transcriptWidth: number;
  summaryNotesSplitRatio: number;
};

const DEFAULT_LAYOUT: PaneLayout = {
  libraryWidth: 256,
  sourceWidth: 300,
  transcriptWidth: 520,
  summaryNotesSplitRatio: 0.42,
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function loadPaneLayout(): PaneLayout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;

  try {
    const raw = localStorage.getItem(PANE_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;

    const parsed = JSON.parse(raw) as Partial<PaneLayout>;
    return {
      libraryWidth: clamp(parsed.libraryWidth, 200, 480, DEFAULT_LAYOUT.libraryWidth),
      sourceWidth: clamp(parsed.sourceWidth, 220, 480, DEFAULT_LAYOUT.sourceWidth),
      transcriptWidth: clamp(
        parsed.transcriptWidth,
        280,
        900,
        DEFAULT_LAYOUT.transcriptWidth,
      ),
      summaryNotesSplitRatio: clamp(
        parsed.summaryNotesSplitRatio,
        0.25,
        0.7,
        DEFAULT_LAYOUT.summaryNotesSplitRatio,
      ),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function savePaneLayout(partial: Partial<PaneLayout>): void {
  if (typeof window === "undefined") return;

  try {
    const current = loadPaneLayout();
    localStorage.setItem(
      PANE_LAYOUT_STORAGE_KEY,
      JSON.stringify({ ...current, ...partial }),
    );
  } catch {
    // localStorage unavailable (private mode, quota, etc.)
  }
}
