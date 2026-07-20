import type { FocusMode } from "@/lib/schema";
import { cn } from "@/lib/utils";

/** モバイル専用 Tailwind クラス（md: 未指定部分は PC に影響しない） */
export const mobileUi = {
  shell: "max-md:pb-[calc(4rem+env(safe-area-inset-bottom,0px))]",
  paneHeader:
    "max-md:h-12 max-md:px-4 max-md:text-base max-md:font-semibold",
  paneBody: "max-md:p-4 max-md:text-[1.0625rem] max-md:leading-[1.75]",
  paneBodyMuted: "max-md:text-[0.9375rem] max-md:leading-relaxed",
  readContent:
    "max-md:text-[1.0625rem] max-md:leading-[1.75] max-md:[&_.ProseMirror]:text-[1.0625rem] max-md:[&_.ProseMirror]:leading-[1.75] max-md:[&_.ProseMirror]:px-1",
  touchButton: "max-md:min-h-11 max-md:min-w-11 max-md:text-base",
  segment:
    "max-md:flex max-md:rounded-xl max-md:border max-md:border-border max-md:bg-muted/40 max-md:p-1",
  segmentItem: (active: boolean) =>
    cn(
      "max-md:flex-1 max-md:rounded-lg max-md:px-3 max-md:py-2.5 max-md:text-center max-md:text-sm max-md:font-medium max-md:transition-colors",
      active
        ? "max-md:bg-background max-md:text-foreground max-md:shadow-sm"
        : "max-md:text-muted-foreground",
    ),
} as const;

export type MobileFocusTab = "transcript" | "notes";

export function focusModeToMobileTab(mode: FocusMode): MobileFocusTab {
  return mode === "transcript" ? "transcript" : "notes";
}

export function mobileTabToFocusMode(tab: MobileFocusTab): FocusMode {
  return tab;
}
