"use client";

import type { Session } from "@/lib/schema";
import { STATUS_LABELS } from "@/lib/labels";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";
import { Badge } from "@/components/ui/badge";

type MobileTopBarProps = {
  session: Session | null;
};

export function MobileTopBar({ session }: MobileTopBarProps) {
  const title = session?.title?.trim() || "VidNote";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold leading-tight">{title}</p>
        {session && (
          <p className="truncate text-xs text-muted-foreground">
            {STATUS_LABELS[session.status]}
          </p>
        )}
      </div>
      {session?.status === "error" && (
        <Badge variant="destructive" className="shrink-0 text-xs">
          エラー
        </Badge>
      )}
      <ThemeToggle />
    </header>
  );
}
