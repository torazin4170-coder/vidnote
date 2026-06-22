import { getDb } from "@/lib/db";
import { toDbSessionRow } from "@/lib/db/row";
import { rowToSession, type Session } from "@/lib/schema";

type SqlValue = string | number | null | bigint | ArrayBuffer;

export async function listSessionSummaries(): Promise<Session[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT
      id, youtube_url, youtube_id, title, thumbnail_url, duration_sec,
      status, notes_html, error_message, created_at, updated_at
     FROM sessions
     ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC`,
  );
  return result.rows.map((row) => {
    const base = toDbSessionRow({
      ...(row as unknown as Record<string, unknown>),
      transcript: null,
      summary_json: null,
    });
    return rowToSession(base);
  });
}

export async function listSessions(): Promise<Session[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT * FROM sessions
     ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC`,
  );
  return result.rows.map((row) =>
    rowToSession(toDbSessionRow(row as unknown as Record<string, unknown>)),
  );
}

export async function getSession(id: string): Promise<Session | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT * FROM sessions WHERE id = ?",
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToSession(
    toDbSessionRow(row as unknown as Record<string, unknown>),
  );
}

export async function insertSession(input: {
  id: string;
  youtubeUrl: string;
  youtubeId: string | null;
  title?: string | null;
  thumbnailUrl?: string | null;
  durationSec?: number | null;
  transcript?: string | null;
}): Promise<Session> {
  const now = new Date().toISOString();
  const hasTranscript = Boolean(input.transcript?.trim());
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO sessions (
      id, youtube_url, youtube_id, title, thumbnail_url, duration_sec,
      status, transcript, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.id,
      input.youtubeUrl,
      input.youtubeId,
      input.title ?? null,
      input.thumbnailUrl ?? null,
      input.durationSec ?? null,
      hasTranscript ? "transcribed" : "pending",
      hasTranscript ? input.transcript!.trim() : null,
      now,
      now,
    ],
  });
  const session = await getSession(input.id);
  if (!session) throw new Error("セッションの作成に失敗しました");
  return session;
}

export async function updateSession(
  id: string,
  patch: Partial<{
    title: string | null;
    thumbnailUrl: string | null;
    durationSec: number | null;
    status: string;
    transcript: string | null;
    summaryJson: string | null;
    notesHtml: string | null;
    errorMessage: string | null;
  }>,
): Promise<Session | null> {
  const fields: string[] = [];
  const values: SqlValue[] = [];

  const map: Record<string, string> = {
    title: "title",
    thumbnailUrl: "thumbnail_url",
    durationSec: "duration_sec",
    status: "status",
    transcript: "transcript",
    summaryJson: "summary_json",
    notesHtml: "notes_html",
    errorMessage: "error_message",
  };

  for (const [key, col] of Object.entries(map)) {
    if (key in patch) {
      fields.push(`${col} = ?`);
      values.push(patch[key as keyof typeof patch] ?? null);
    }
  }

  if (fields.length === 0) return getSession(id);

  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  const db = await getDb();
  await db.execute({
    sql: `UPDATE sessions SET ${fields.join(", ")} WHERE id = ?`,
    args: values,
  });

  return getSession(id);
}

export async function deleteSession(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({
    sql: "DELETE FROM sessions WHERE id = ?",
    args: [id],
  });
  return result.rowsAffected > 0;
}

export async function deleteAllSessions(): Promise<number> {
  const db = await getDb();
  const result = await db.execute("DELETE FROM sessions");
  return result.rowsAffected;
}

export async function recoverStaleProcessingSessions(): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `
      UPDATE sessions
      SET status = 'pending', error_message = NULL, updated_at = ?
      WHERE status IN ('fetching_captions', 'summarizing')
        AND datetime(updated_at) < datetime('now', '-5 minutes')
    `,
    args: [now],
  });
  return result.rowsAffected;
}

export async function getProcessingSessionId(): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT id FROM sessions
     WHERE status IN ('fetching_captions', 'summarizing')
     ORDER BY datetime(updated_at) ASC
     LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return String((row as Record<string, unknown>).id);
}

export async function getPendingSessionIds(): Promise<string[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT id FROM sessions
     WHERE status = 'pending'
     ORDER BY datetime(created_at) ASC`,
  );
  return result.rows.map((row) =>
    String((row as Record<string, unknown>).id),
  );
}
