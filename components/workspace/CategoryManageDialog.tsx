"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import type { Category } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DeleteConfirmDialog } from "@/components/workspace/DeleteConfirmDialog";

type CategoryManageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onCreateCategory: (name: string) => void | Promise<void>;
  onUpdateCategory: (id: string, name: string) => void | Promise<void>;
  onDeleteCategory: (id: string) => void | Promise<void>;
};

export function CategoryManageDialog({
  open,
  onOpenChange,
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}: CategoryManageDialogProps) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  const resetForm = () => {
    setNewName("");
    setEditingId(null);
    setEditName("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await onCreateCategory(name);
      setNewName("");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await onUpdateCategory(id, name);
      setEditingId(null);
      setEditName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>カテゴリー管理</DialogTitle>
            <DialogDescription>
              動画履歴を整理するためのカテゴリーを追加・変更・削除できます。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                placeholder="新しいカテゴリー名"
                value={newName}
                maxLength={40}
                disabled={busy}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
              />
              <Button
                type="button"
                disabled={busy || !newName.trim()}
                onClick={() => void handleCreate()}
              >
                <Plus />
                追加
              </Button>
            </div>

            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                カテゴリーはまだありません
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {categories.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5"
                  >
                    {editingId === category.id ? (
                      <>
                        <Input
                          value={editName}
                          maxLength={40}
                          disabled={busy}
                          className="flex-1"
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              void handleSaveEdit(category.id);
                            }
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditName("");
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || !editName.trim()}
                          onClick={() => void handleSaveEdit(category.id)}
                        >
                          保存
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(null);
                            setEditName("");
                          }}
                        >
                          取消
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {category.name}
                        </span>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(category.id);
                            setEditName(category.name);
                          }}
                        >
                          <Pencil />
                          <span className="sr-only">名前を変更</span>
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={busy}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(category)}
                        >
                          <Trash2 />
                          <span className="sr-only">削除</span>
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
        title="カテゴリーを削除"
        itemName={deleteTarget?.name ?? "このカテゴリー"}
        description={`「${deleteTarget?.name ?? ""}」を削除します。割り当て済みの動画は「未分類」になります。`}
        onConfirm={async () => {
          if (deleteTarget) {
            await onDeleteCategory(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
