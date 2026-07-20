"use client";

import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { cn } from "@/lib/utils";

type NoteEditorProps = {
  initialContent: string;
  onChange: (html: string) => void;
  className?: string;
};

export function NoteEditor({ initialContent, onChange, className }: NoteEditorProps) {
  return (
    <div className={cn("h-full min-h-0", className)}>
      <RichTextEditor
        initialContent={initialContent}
        onChange={onChange}
        showFixedToolbar
        showHistory
        className="vidnote-mobile-editor"
        minHeightClassName="min-h-[240px] max-md:min-h-[50vh]"
      />
    </div>
  );
}
