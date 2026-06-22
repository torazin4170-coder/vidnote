import { GoogleGenerativeAI } from "@google/generative-ai";

import {
  summarySectionSchema,
  type SummarySections,
} from "@/lib/schema";

const SUMMARY_PROMPT = `あなたは学習支援のための要約アシスタントです。
以下の YouTube 動画の文字起こしを読み、日本語で章立て要約を作成してください。

必ず次の JSON 形式のみを返してください。Markdown や説明文は不要です。

{
  "overview": "2〜4文の概要",
  "keyPoints": ["重要ポイント1", "重要ポイント2"],
  "terms": [{ "term": "用語", "definition": "説明" }],
  "actions": ["学習者が取るべきアクション1"]
}

文字起こし:
`;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY が未設定です。.env.local に API キーを設定してください。",
    );
  }
  return key;
}

function getModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

const CHUNK_CHAR_LIMIT = 80_000;

async function summarizeChunk(
  transcript: string,
): Promise<SummarySections> {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = genAI.getGenerativeModel({
    model: getModelName(),
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(SUMMARY_PROMPT + transcript);
      const text = result.response.text();
      const parsed = JSON.parse(extractJson(text));
      return summarySectionSchema.parse(parsed);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error("要約に失敗しました");
}

function mergeSummaries(parts: SummarySections[]): SummarySections {
  return {
    overview: parts.map((p) => p.overview).join("\n\n"),
    keyPoints: [...new Set(parts.flatMap((p) => p.keyPoints))],
    terms: parts.flatMap((p) => p.terms),
    actions: [...new Set(parts.flatMap((p) => p.actions))],
  };
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function summarizeTranscript(
  transcript: string,
): Promise<SummarySections> {
  if (transcript.length <= CHUNK_CHAR_LIMIT) {
    return summarizeChunk(transcript);
  }

  const chunks: string[] = [];
  let offset = 0;
  while (offset < transcript.length) {
    chunks.push(transcript.slice(offset, offset + CHUNK_CHAR_LIMIT));
    offset += CHUNK_CHAR_LIMIT;
  }

  const partials = await Promise.all(chunks.map((c) => summarizeChunk(c)));
  return mergeSummaries(partials);
}
