"use client";

import type { Editor } from "@tiptap/react";
import { Bold, Italic, List, Redo, Undo } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EditorFormatToolbarProps = {
  editor: Editor;
  className?: string;
  showHistory?: boolean;
};

export function EditorFormatToolbar({
  editor,
  className,
  showHistory = true,
}: EditorFormatToolbarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <Button
        type="button"
        variant={editor.isActive("bold") ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="太字"
      >
        <Bold />
      </Button>
      <Button
        type="button"
        variant={editor.isActive("italic") ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="斜体"
      >
        <Italic />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => editor.chain().focus().setColor("#dc2626").run()}
        aria-label="赤字"
      >
        <span className="text-destructive">A</span>
      </Button>
      <Button
        type="button"
        variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="箇条書き"
      >
        <List />
      </Button>
      {showHistory && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => editor.chain().focus().undo().run()}
            aria-label="元に戻す"
          >
            <Undo />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => editor.chain().focus().redo().run()}
            aria-label="やり直し"
          >
            <Redo />
          </Button>
        </>
      )}
    </div>
  );
}
