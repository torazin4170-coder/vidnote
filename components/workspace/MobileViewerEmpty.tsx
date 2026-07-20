"use client";

import { History } from "lucide-react";

import { Button } from "@/components/ui/button";

type MobileViewerEmptyProps = {
  onOpenHistory: () => void;
};

export function MobileViewerEmpty({ onOpenHistory }: MobileViewerEmptyProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <History className="size-10 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">セッションが選択されていません</p>
        <p className="text-sm text-muted-foreground">
          履歴から動画を選ぶと、字幕や要点・ノートを閲覧できます。
        </p>
      </div>
      <Button type="button" onClick={onOpenHistory}>
        履歴を開く
      </Button>
    </div>
  );
}
