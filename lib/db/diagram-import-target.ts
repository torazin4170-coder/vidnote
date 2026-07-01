import { getDb } from "@/lib/db";

const DIAGRAM_IMPORT_TARGET_KEY = "diagram_import_target";

export type DiagramImportTarget = {
  sessionId: string;
  title: string | null;
  updatedAt: string;
};

export async function setDiagramImportTarget(input: {
  sessionId: string;
  title?: string | null;
}): Promise<DiagramImportTarget> {
  const db = await getDb();
  const payload: DiagramImportTarget = {
    sessionId: input.sessionId,
    title: input.title?.trim() ?? null,
    updatedAt: new Date().toISOString(),
  };

  await db.execute({
    sql: `INSERT INTO app_settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [DIAGRAM_IMPORT_TARGET_KEY, JSON.stringify(payload), payload.updatedAt],
  });

  return payload;
}

export async function getDiagramImportTarget(): Promise<DiagramImportTarget | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT value FROM app_settings WHERE key = ?",
    args: [DIAGRAM_IMPORT_TARGET_KEY],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row?.value) return null;

  try {
    const parsed = JSON.parse(String(row.value)) as DiagramImportTarget;
    const sessionId = parsed.sessionId?.trim();
    if (!sessionId) return null;
    return {
      sessionId,
      title: parsed.title ?? null,
      updatedAt: parsed.updatedAt ?? "",
    };
  } catch {
    return null;
  }
}
