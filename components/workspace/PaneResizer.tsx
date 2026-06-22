"use client";

import { useCallback } from "react";

import { cn } from "@/lib/utils";

type PaneResizerProps = {
  onResize: (deltaX: number) => void;
  className?: string;
};

export function PaneResizer({ onResize, className }: PaneResizerProps) {
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let lastX = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - lastX;
        lastX = ev.clientX;
        if (delta !== 0) onResize(delta);
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="ペイン幅を調整"
      onMouseDown={onMouseDown}
      className={cn(
        "w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40 active:bg-primary/60",
        className,
      )}
    />
  );
}
