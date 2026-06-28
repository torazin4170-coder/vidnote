export type VisualExplainerTheme = "light" | "dark";

export const VISNOTE_THEME_STORAGE_KEY = "vidnote-theme";

export function readVidNoteTheme(): VisualExplainerTheme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(VISNOTE_THEME_STORAGE_KEY);
  if (stored === "light") return "light";
  return "dark";
}
