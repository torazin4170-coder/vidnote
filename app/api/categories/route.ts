import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  deleteCategory,
  insertCategory,
  listCategories,
  updateCategory,
} from "@/lib/db/categories";

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export async function GET() {
  const categories = await listCategories();
  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const category = await insertCategory({
      id: randomUUID(),
      name: body.name,
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "カテゴリーの作成に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = z
      .object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(40),
      })
      .parse(await request.json());
    const category = await updateCategory(body.id, { name: body.name });
    if (!category) {
      return NextResponse.json(
        { error: "カテゴリーが見つかりません" },
        { status: 404 },
      );
    }
    return NextResponse.json({ category });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "カテゴリーの更新に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }
    const ok = await deleteCategory(id);
    if (!ok) {
      return NextResponse.json(
        { error: "カテゴリーが見つかりません" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "カテゴリーの削除に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
