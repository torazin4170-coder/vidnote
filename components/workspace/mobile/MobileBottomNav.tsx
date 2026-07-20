"use client";

import { FileText, History, NotebookPen } from "lucide-react";

import type { FocusMode } from "@/lib/schema";
import { useSidebar } from "@/components/ui/sidebar";
import {
  focusModeToMobileTab,
  mobileTabToFocusMode,
  type MobileFocusTab,
} from "@/components/workspace/mobile/mobile-ui";
import { cn } from "@/lib/utils";

type MobileBottomNavProps = {
  focusMode: FocusMode;
  hasSession: boolean;
  onFocusModeChange: (mode: FocusMode) => void;
};

const tabs: Array<{
  id: MobileFocusTab | "history";
  label: string;
  icon: typeof History;
}> = [
  { id: "history", label: "履歴", icon: History },
  { id: "transcript", label: "字幕", icon: FileText },
  { id: "notes", label: "要点・ノート", icon: NotebookPen },
];

export function MobileBottomNav({
  focusMode,
  hasSession,
  onFocusModeChange,
}: MobileBottomNavProps) {
  const { openMobile, setOpenMobile } = useSidebar();
  const activeTab = focusModeToMobileTab(focusMode);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/90 md:hidden"
      aria-label="モバイルナビゲーション"
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-3">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isHistory = id === "history";
          const isActive = isHistory
            ? openMobile || !hasSession
            : activeTab === id;
          const disabled = !isHistory && !hasSession;

          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (isHistory) {
                  setOpenMobile(true);
                  return;
                }
                onFocusModeChange(mobileTabToFocusMode(id));
              }}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 px-2 text-[11px] font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground",
                disabled && "opacity-40",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className={cn("size-5", isActive && "stroke-[2.5px]")} />
              <span className="leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
