import { z } from "zod";

export const sessionStatusSchema = z.enum([
  "pending",
  "fetching_captions",
  "transcribed",
  "summarizing",
  "done",
  "error",
]);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const summarySectionSchema = z.object({
  overview: z.string(),
  keyPoints: z.array(z.string()),
  terms: z.array(z.object({ term: z.string(), definition: z.string() })),
  actions: z.array(z.string()),
});

export type SummarySections = z.infer<typeof summarySectionSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  youtubeUrl: z.string(),
  youtubeId: z.string().nullable(),
  title: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  durationSec: z.number().nullable(),
  status: sessionStatusSchema,
  transcript: z.string().nullable(),
  summaryJson: summarySectionSchema.nullable(),
  notesHtml: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Session = z.infer<typeof sessionSchema>;

export type DbSessionRow = {
  id: string;
  youtube_url: string;
  youtube_id: string | null;
  title: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  status: string;
  transcript: string | null;
  summary_json: string | null;
  notes_html: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToSession(row: DbSessionRow): Session {
  let summaryJson: SummarySections | null = null;
  if (row.summary_json) {
    try {
      summaryJson = summarySectionSchema.parse(JSON.parse(row.summary_json));
    } catch {
      summaryJson = null;
    }
  }

  return {
    id: row.id,
    youtubeUrl: row.youtube_url,
    youtubeId: row.youtube_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    durationSec: row.duration_sec,
    status: sessionStatusSchema.parse(row.status),
    transcript: row.transcript,
    summaryJson,
    notesHtml: row.notes_html,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type FocusMode = "all" | "transcript" | "notes";
