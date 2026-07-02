"use client";

import { useCallback, useEffect, useRef } from "react";
import { Color } from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import { BubbleMenu, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { EditorFormatToolbar } from "@/components/editor/EditorFormatToolbar";
import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  initialContent: string;
  onChange: (html: string) => void;
  editorClassName?: string;
  showFixedToolbar?: boolean;
  showHistory?: boolean;
  minHeightClassName?: string;
};

export function RichTextEditor({
  initialContent,
  onChange,
  editorClassName,
  showFixedToolbar = true,
  showHistory = true,
  minHeightClassName = "min-h-[200px]",
}: RichTextEditorProps) {
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
        class: cn(
          minHeightClassName,
          "rounded-lg border border-input bg-card px-3 py-2 text-sm leading-relaxed focus:outline-none",
          editorClassName,
        ),
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
    <div className="flex h-full min-h-0 flex-col gap-2">
      {showFixedToolbar && (
        <EditorFormatToolbar editor={editor} showHistory={showHistory} />
      )}
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100, placement: "top" }}
          className="flex items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-md"
        >
          <EditorFormatToolbar editor={editor} showHistory={false} />
        </BubbleMenu>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
