"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type PlainTranscriptEditorProps = {
  sessionId: string;
  initialPlainText: string;
  onChange: (plainText: string) => void;
  className?: string;
};

export function PlainTranscriptEditor({
  sessionId,
  initialPlainText,
  onChange,
  className,
}: PlainTranscriptEditorProps) {
  const [text, setText] = useState(initialPlainText);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef(initialPlainText);

  useEffect(() => {
    setText(initialPlainText);
    lastEmitted.current = initialPlainText;
  }, [sessionId]);

  useEffect(() => {
    if (initialPlainText === lastEmitted.current) return;
    if (initialPlainText === text) return;
    setText(initialPlainText);
    lastEmitted.current = initialPlainText;
  }, [initialPlainText, text]);

  const debouncedChange = useCallback(
    (value: string) => {
      if (value === lastEmitted.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        lastEmitted.current = value;
        onChange(value);
      }, 600);
    },
    [onChange],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return (
    <textarea
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        debouncedChange(next);
      }}
      spellCheck={false}
      className={cn(
        "min-h-[320px] w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label="文字起こし"
    />
  );
}
