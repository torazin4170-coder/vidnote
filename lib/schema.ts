import { z } from "zod";

export const sessionStatusSchema = z.enum([
  "pending",
  "fetching_captions",
  "polishing_transcript",
  "transcribed",
  "summarizing",
  "generating_diagram",
  "done",
  "error",
]);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const frameworkApproachSchema = z.enum([
  "decompose",
  "structure",
  "essence",
  "perspective",
]);

export type FrameworkApproach = z.infer<typeof frameworkApproachSchema>;

export const frameworkViewSchema = z.object({
  framework: z.string(),
  approach: frameworkApproachSchema,
  title: z.string(),
  items: z.array(z.string()).min(1),
});

export type FrameworkView = z.infer<typeof frameworkViewSchema>;

export const summarySectionSchema = z.object({
  overview: z.string(),
  keyPoints: z.array(z.string()),
  terms: z.array(z.object({ term: z.string(), definition: z.string() })),
  actions: z.array(z.string()),
  frameworkViews: z.array(frameworkViewSchema).default([]),
});

export type SummarySections = z.infer<typeof summarySectionSchema>;

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Category = z.infer<typeof categorySchema>;

export const sessionSchema = z.object({
  id: z.string(),
  youtubeUrl: z.string(),
  youtubeId: z.string().nullable(),
  title: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  durationSec: z.number().nullable(),
  status: sessionStatusSchema,
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  transcriptRaw: z.string().nullable(),
  transcript: z.string().nullable(),
  summaryJson: summarySectionSchema.nullable(),
  hasVisualExplainer: z.boolean(),
  visualExplainerHtml: z.string().nullable(),
  notesHtml: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Session = z.infer<typeof sessionSchema>;

export type DbCategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DbSessionRow = {
  id: string;
  youtube_url: string;
  youtube_id: string | null;
  title: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  status: string;
  category_id: string | null;
  category_name?: string | null;
  transcript_raw: string | null;
  transcript: string | null;
  summary_json: string | null;
  has_visual_explainer?: number | boolean | null;
  visual_explainer_html?: string | null;
  notes_html: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToCategory(row: DbCategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
    categoryId: row.category_id ?? null,
    categoryName: row.category_name ?? null,
    transcriptRaw: row.transcript_raw ?? null,
    transcript: row.transcript,
    summaryJson,
    hasVisualExplainer: Boolean(row.has_visual_explainer),
    visualExplainerHtml: null,
    notesHtml: row.notes_html,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type FocusMode = "all" | "transcript" | "notes";

export type CategoryFilter = "all" | "uncategorized" | string;
