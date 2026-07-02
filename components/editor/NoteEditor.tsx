"use client";

import { RichTextEditor } from "@/components/editor/RichTextEditor";

type NoteEditorProps = {
  initialContent: string;
  onChange: (html: string) => void;
};

export function NoteEditor({ initialContent, onChange }: NoteEditorProps) {
  return (
    <RichTextEditor
      initialContent={initialContent}
      onChange={onChange}
      showFixedToolbar
      showHistory
    />
  );
}
