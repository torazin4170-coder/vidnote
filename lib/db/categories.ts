import { getDb } from "@/lib/db";
import { toDbCategoryRow } from "@/lib/db/row";
import { rowToCategory, type Category } from "@/lib/schema";

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT * FROM categories
     ORDER BY sort_order ASC, datetime(created_at) ASC`,
  );
  return result.rows.map((row) =>
    rowToCategory(toDbCategoryRow(row as Record<string, unknown>)),
  );
}

export async function getCategory(id: string): Promise<Category | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT * FROM categories WHERE id = ?",
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToCategory(toDbCategoryRow(row as Record<string, unknown>));
}

export async function insertCategory(input: {
  id: string;
  name: string;
  sortOrder?: number;
}): Promise<Category> {
  const now = new Date().toISOString();
  const db = await getDb();
  const maxResult = await db.execute(
    "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM categories",
  );
  const maxOrder = Number(
    (maxResult.rows[0] as Record<string, unknown> | undefined)?.max_order ?? -1,
  );
  const sortOrder = input.sortOrder ?? maxOrder + 1;

  await db.execute({
    sql: `INSERT INTO categories (id, name, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [input.id, input.name.trim(), sortOrder, now, now],
  });

  const category = await getCategory(input.id);
  if (!category) throw new Error("カテゴリーの作成に失敗しました");
  return category;
}

export async function updateCategory(
  id: string,
  patch: Partial<{ name: string; sortOrder: number }>,
): Promise<Category | null> {
  const fields: string[] = [];
  const values: (string | number)[] = [];

  if ("name" in patch) {
    fields.push("name = ?");
    values.push(patch.name!.trim());
  }
  if ("sortOrder" in patch) {
    fields.push("sort_order = ?");
    values.push(patch.sortOrder!);
  }

  if (fields.length === 0) return getCategory(id);

  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  const db = await getDb();
  await db.execute({
    sql: `UPDATE categories SET ${fields.join(", ")} WHERE id = ?`,
    args: values,
  });

  return getCategory(id);
}

export async function deleteCategory(id: string): Promise<boolean> {
  const db = await getDb();
  await db.execute({
    sql: "UPDATE sessions SET category_id = NULL WHERE category_id = ?",
    args: [id],
  });
  const result = await db.execute({
    sql: "DELETE FROM categories WHERE id = ?",
    args: [id],
  });
  return result.rowsAffected > 0;
}
