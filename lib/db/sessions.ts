import { getDb } from "@/lib/db";
import { toDbSessionRow } from "@/lib/db/row";
import { rowToSession, summarySectionSchema, type Session, type SummarySections } from "@/lib/schema";

type SqlValue = string | number | null | bigint | ArrayBuffer;

const HAS_VISUAL_EXPLAINER_SQL = `CASE
  WHEN s.visual_explainer_html IS NOT NULL
   AND length(trim(s.visual_explainer_html)) > 0
  THEN 1 ELSE 0 END AS has_visual_explainer`;

const SESSION_META_SELECT = `
  SELECT
    s.id, s.youtube_url, s.youtube_id, s.title, s.thumbnail_url, s.duration_sec,
    s.status, s.category_id, c.name AS category_name,
    ${HAS_VISUAL_EXPLAINER_SQL},
    s.error_message, s.created_at, s.updated_at
  FROM sessions s
  LEFT JOIN categories c ON c.id = s.category_id
`;

const SESSION_FULL_SELECT = `
  SELECT
    s.id, s.youtube_url, s.youtube_id, s.title, s.thumbnail_url, s.duration_sec,
    s.status, s.category_id, c.name AS category_name,
    s.transcript_raw, s.transcript, s.summary_json,
    ${HAS_VISUAL_EXPLAINER_SQL},
    s.notes_html, s.error_message,
    s.created_at, s.updated_at
  FROM sessions s
  LEFT JOIN categories c ON c.id = s.category_id
`;

const SUMMARY_SELECT = `
  SELECT
    s.id, s.youtube_url, s.youtube_id, s.title, s.thumbnail_url, s.duration_sec,
    s.status, s.category_id, c.name AS category_name,
    ${HAS_VISUAL_EXPLAINER_SQL},
    s.error_message, s.created_at, s.updated_at
  FROM sessions s
  LEFT JOIN categories c ON c.id = s.category_id
`;

function mapSummaryRow(row: Record<string, unknown>): Session {
  const base = toDbSessionRow({
    ...row,
    transcript_raw: null,
    transcript: null,
    summary_json: null,
    visual_explainer_html: null,
  });
  return rowToSession(base);
}

export async function listSessionSummaries(options?: {
  search?: string;
}): Promise<Session[]> {
  const db = await getDb();
  const search = options?.search?.trim();

  if (search) {
    const pattern = `%${search}%`;
    const result = await db.execute({
      sql: `${SUMMARY_SELECT}
            WHERE s.title LIKE ?
               OR s.youtube_url LIKE ?
               OR s.youtube_id LIKE ?
               OR IFNULL(s.notes_html, '') LIKE ?
               OR IFNULL(s.transcript, '') LIKE ?
               OR IFNULL(s.summary_json, '') LIKE ?
               OR IFNULL(c.name, '') LIKE ?
            ORDER BY datetime(s.updated_at) DESC, datetime(s.created_at) DESC`,
      args: [pattern, pattern, pattern, pattern, pattern, pattern, pattern],
    });
    return result.rows.map((row) =>
      mapSummaryRow(row as Record<string, unknown>),
    );
  }

  const result = await db.execute(
    `${SUMMARY_SELECT}
     ORDER BY datetime(s.updated_at) DESC, datetime(s.created_at) DESC`,
  );
  return result.rows.map((row) =>
    mapSummaryRow(row as Record<string, unknown>),
  );
}

export async function listSessions(): Promise<Session[]> {
  const db = await getDb();
  const result = await db.execute(
    `${SESSION_FULL_SELECT}
     ORDER BY datetime(s.updated_at) DESC, datetime(s.created_at) DESC`,
  );
  return result.rows.map((row) =>
    rowToSession(toDbSessionRow(row as Record<string, unknown>)),
  );
}

export async function getSessionMeta(id: string): Promise<Session | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `${SESSION_META_SELECT} WHERE s.id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToSession(toDbSessionRow(row as Record<string, unknown>));
}

export type SessionBodies = {
  transcriptRaw: string | null;
  transcript: string | null;
  summaryJson: SummarySections | null;
  notesHtml: string | null;
};

export async function getSessionBodies(id: string): Promise<SessionBodies | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT transcript_raw, transcript, summary_json, notes_html
          FROM sessions WHERE id = ?`,
    args: [id],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  let summaryJson: SummarySections | null = null;
  if (row.summary_json) {
    try {
      summaryJson = summarySectionSchema.parse(
        JSON.parse(String(row.summary_json)),
      );
    } catch {
      summaryJson = null;
    }
  }

  return {
    transcriptRaw: row.transcript_raw != null ? String(row.transcript_raw) : null,
    transcript: row.transcript != null ? String(row.transcript) : null,
    summaryJson,
    notesHtml: row.notes_html != null ? String(row.notes_html) : null,
  };
}

export async function getSession(id: string): Promise<Session | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `${SESSION_FULL_SELECT} WHERE s.id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToSession(
    toDbSessionRow(row as Record<string, unknown>),
  );
}

export async function getSessionDiagramHtml(id: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT visual_explainer_html FROM sessions WHERE id = ?`,
    args: [id],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row?.visual_explainer_html) return null;
  const html = String(row.visual_explainer_html).trim();
  return html.length > 0 ? html : null;
}

export async function insertSession(input: {
  id: string;
  youtubeUrl: string;
  youtubeId: string | null;
  title?: string | null;
  thumbnailUrl?: string | null;
  durationSec?: number | null;
  transcript?: string | null;
  categoryId?: string | null;
}): Promise<Session> {
  const now = new Date().toISOString();
  const hasTranscript = Boolean(input.transcript?.trim());
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO sessions (
      id, youtube_url, youtube_id, title, thumbnail_url, duration_sec,
      status, category_id, transcript, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.id,
      input.youtubeUrl,
      input.youtubeId,
      input.title ?? null,
      input.thumbnailUrl ?? null,
      input.durationSec ?? null,
      hasTranscript ? "transcribed" : "pending",
      input.categoryId ?? null,
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
    categoryId: string | null;
    transcriptRaw: string | null;
    transcript: string | null;
    summaryJson: string | null;
    visualExplainerHtml: string | null;
    notesHtml: string | null;
    errorMessage: string | null;
  }>,
  options?: { returnMode?: "full" | "meta" },
): Promise<Session | null> {
  const fields: string[] = [];
  const values: SqlValue[] = [];

  const map: Record<string, string> = {
    title: "title",
    thumbnailUrl: "thumbnail_url",
    durationSec: "duration_sec",
    status: "status",
    categoryId: "category_id",
    transcriptRaw: "transcript_raw",
    transcript: "transcript",
    summaryJson: "summary_json",
    visualExplainerHtml: "visual_explainer_html",
    notesHtml: "notes_html",
    errorMessage: "error_message",
  };

  for (const [key, col] of Object.entries(map)) {
    if (key in patch) {
      fields.push(`${col} = ?`);
      values.push(patch[key as keyof typeof patch] ?? null);
    }
  }

  if (fields.length === 0) {
    return options?.returnMode === "meta" ? getSessionMeta(id) : getSession(id);
  }

  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  const db = await getDb();
  await db.execute({
    sql: `UPDATE sessions SET ${fields.join(", ")} WHERE id = ?`,
    args: values,
  });

  return options?.returnMode === "meta" ? getSessionMeta(id) : getSession(id);
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
      WHERE status IN ('fetching_captions', 'polishing_transcript', 'summarizing')
        AND datetime(updated_at) < datetime('now', '-5 minutes')
    `,
    args: [now],
  });

  const diagramResult = await db.execute({
    sql: `
      UPDATE sessions
      SET status = 'done',
          error_message = '図解生成がタイムアウトしました。「図解を再生成」を試してください。',
          updated_at = ?
      WHERE status = 'generating_diagram'
        AND datetime(updated_at) < datetime('now', '-5 minutes')
    `,
    args: [now],
  });

  return result.rowsAffected + diagramResult.rowsAffected;
}

export async function getProcessingSessionId(): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT id FROM sessions
     WHERE status IN ('fetching_captions', 'polishing_transcript', 'summarizing')
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
