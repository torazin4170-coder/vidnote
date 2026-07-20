"use client";

import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mobileUi } from "@/components/workspace/mobile/mobile-ui";

type MobileViewerEmptyProps = {
  onOpenHistory: () => void;
};

export function MobileViewerEmpty({ onOpenHistory }: MobileViewerEmptyProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <History className="size-8 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-2">
        <p className="text-lg font-semibold">動画を選んでください</p>
        <p className={`${mobileUi.paneBodyMuted} text-muted-foreground`}>
          下部の「履歴」から過去の動画を選ぶと、字幕や要点・ノートを読めます。
        </p>
      </div>
      <Button
        type="button"
        size="lg"
        className={mobileUi.touchButton}
        onClick={onOpenHistory}
      >
        履歴を開く
      </Button>
    </div>
  );
}
