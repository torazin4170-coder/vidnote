import type { DbSessionRow } from "@/lib/schema";

export function toDbSessionRow(row: Record<string, unknown>): DbSessionRow {
  return {
    id: String(row.id),
    youtube_url: String(row.youtube_url),
    youtube_id: row.youtube_id != null ? String(row.youtube_id) : null,
    title: row.title != null ? String(row.title) : null,
    thumbnail_url:
      row.thumbnail_url != null ? String(row.thumbnail_url) : null,
    duration_sec:
      row.duration_sec != null ? Number(row.duration_sec) : null,
    status: String(row.status),
    transcript: row.transcript != null ? String(row.transcript) : null,
    summary_json:
      row.summary_json != null ? String(row.summary_json) : null,
    notes_html: row.notes_html != null ? String(row.notes_html) : null,
    error_message:
      row.error_message != null ? String(row.error_message) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
