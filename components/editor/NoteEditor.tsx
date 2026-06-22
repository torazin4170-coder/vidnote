"use client";

import { useCallback, useEffect, useRef } from "react";
import { Color } from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  List,
  Redo,
  Undo,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NoteEditorProps = {
  initialContent: string;
  onChange: (html: string) => void;
};

export function NoteEditor({ initialContent, onChange }: NoteEditorProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastExternalContent = useRef(initialContent);
  const lastEmittedHtml = useRef(initialContent);
  const suppressUpdate = useRef(false);

  const debouncedChange = useCallback(
    (html: string) => {
      if (html === lastEmittedHtml.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        lastEmittedHtml.current = html;
        onChange(html);
      }, 600);
    },
    [onChange],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
    ],
    content: initialContent || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[200px] rounded-lg border border-input bg-card px-3 py-2 text-sm leading-relaxed focus:outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (suppressUpdate.current) return;
      debouncedChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (initialContent === lastExternalContent.current) return;

    lastExternalContent.current = initialContent;
    const next = initialContent || "<p></p>";
    if (editor.getHTML() === next) return;

    suppressUpdate.current = true;
    editor.commands.setContent(next, false);
    lastEmittedHtml.current = editor.getHTML();
    suppressUpdate.current = false;
  }, [editor, initialContent]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editor) return;
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        editor.chain().focus().toggleBold().run();
      }
      if (e.ctrlKey && e.shiftKey && e.key === "R") {
        e.preventDefault();
        editor.chain().focus().setColor("#dc2626").run();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
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
      </div>
      <EditorContent
        editor={editor}
        className={cn("min-h-0 flex-1 [&_.ProseMirror]:min-h-[200px]")}
      />
    </div>
  );
}
