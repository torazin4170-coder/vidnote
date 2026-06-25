export type VisualExplainerTheme = "light" | "dark";

export const VISNOTE_THEME_STORAGE_KEY = "vidnote-theme";

export function readVidNoteTheme(): VisualExplainerTheme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(VISNOTE_THEME_STORAGE_KEY) === "dark"
    ? "dark"
    : "light";
}
