import { GoogleGenerativeAI } from "@google/generative-ai";

import { assembleVisualExplainerHtml } from "@/lib/visual-explainer/assemble";
import type { GeminiCallContext } from "@/lib/ai/gemini-usage-types";
import {
  GeminiDailyQuotaExceededError,
  waitForGeminiSlot,
} from "@/lib/ai/gemini-rate-limit";
import { recordGeminiUsage } from "@/lib/db/gemini-usage";
import {
  summarySectionSchema,
  type SummarySections,
} from "@/lib/schema";

export type { GeminiCallContext, GeminiUsageGauge, GeminiUsageQuota, GeminiUsageSummary, GeminiRateLimitStatus } from "@/lib/ai/gemini-usage-types";
export { GeminiDailyQuotaExceededError, assertCanStartVideoProcessing, getGeminiRateLimitStatus } from "@/lib/ai/gemini-rate-limit";
export { getGeminiUsageReport, getGeminiUsageSummary } from "@/lib/db/gemini-usage";
export { getGeminiUsageQuota, setGeminiUsageQuota } from "@/lib/db/gemini-quota";

const POLISH_PROMPT = `あなたは字幕テキストの校正アシスタントです。
以下の YouTube 動画の文字起こしを読みやすく整えてください。

厳守ルール:
- 意味・事実・固有名詞を変更しない
- 新しい内容を追加しない
- 明らかな誤字・脱字・同音異字のみ修正する
- 読みやすい位置で空行（段落区切り）を入れる
- 出力は校正後のプレーンテキストのみ（説明・Markdown・JSON は不要）

文字起こし:
`;

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

const VISUAL_EXPLAINER_PROMPT = `あなたは図解 HTML を生成するアシスタントです。
YouTube 動画の要点を、初めて聞く人にもわかる図解ページの <main> 内コンテンツとして出力してください。

## 出力ルール（厳守）
- 出力は <main> タグの中身のみ（DOCTYPE / html / head / body / script は含めない）
- Tailwind CSS クラスのみでスタイリング（<style> タグ・style 属性は禁止）
- アイコンは Lucide Icons の <i data-lucide="アイコン名" class="w-8 h-8"> のみ（SVG 直書き禁止）
- 絵文字禁止。React / shadcn 禁止。インタラクティブ要素禁止
- 追加の <script> 禁止。外部画像 URL 禁止
- 日本語で書く。概論→各論。専門用語は初出で平易に解説

## レイアウト品質（最重要・厳守）
重なり・不自然な空白・バランス崩れを絶対に起こさないこと。

禁止:
- position: absolute / relative による重ね合わせ（absolute / relative クラス禁止）
- 負の margin、translate、inset、overlap 目的の grid/flex
- 放射状・半円状・円周配置など座標指定が必要なレイアウト
- アイコンと本文を同一行に詰め込む（flex-row で icon+長文を横並びにしない）
- 矢印アイコンをテキストの上に重ねる
- 細いバー・pill 形状の内部にラベルや長い数値を入れる

必須:
- 各図解ブロックは「カード」単位: \`rounded-xl border border-ads-border bg-ads-surface p-5\`
- カード内は縦積み: \`flex flex-col items-center gap-3 text-center\`（アイコン→見出し→説明の順）
- セクション間は \`mb-10\` 以上。カード間は \`gap-6\`
- 左右対比: \`grid grid-cols-1 sm:grid-cols-2 gap-6\` で等幅カード2枚（中央に要素を置かない）
- 縦フロー・循環: カードを \`flex flex-col items-center gap-4\` で縦に並べ、矢印は \`flex justify-center py-2\` の独立行に \`data-lucide="arrow-down"\` を1つだけ置く
- 3点以上の並列: \`grid grid-cols-1 sm:grid-cols-3 gap-4\`（各セルはカード）
- 数値比較・棒グラフ: 各行 \`flex flex-col gap-2 mb-4\`。1行目=ラベル（左寄せ）、2行目= \`flex items-center gap-3\` でバー（flex-1 h-3 rounded-full）+ 数値（flex-shrink-0、バーの外）
- アイコンは \`w-10 h-10\` または \`w-12 h-12\`、背景付き円 \`rounded-full p-3\` の中に置く
- 長文は \`text-sm leading-relaxed break-words\`、見出しは \`text-lg font-bold\`

## 構成
- 冒頭: ヒーロー（バッジ＋タイトル＋2〜3文の概要）
- 続けて「一枚絵サマリー」: 上記カード/グリッドで全体像を1ブロックに
- 以降: 要点ごとにカードまたは2列グリッドで深掘り（説明文だけの段落は最小限）

## 参考パターン（左右対比）
<div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
  <div class="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-center">
    <div class="rounded-full bg-red-500/10 p-3"><i data-lucide="sword" class="w-10 h-10 text-red-600"></i></div>
    <h3 class="text-lg font-bold text-red-600">見出し</h3>
    <p class="text-sm leading-relaxed break-words text-ads-muted">説明文</p>
  </div>
  <div class="flex flex-col items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/10 p-5 text-center">
    <div class="rounded-full bg-green-500/10 p-3"><i data-lucide="piggy-bank" class="w-10 h-10 text-green-600"></i></div>
    <h3 class="text-lg font-bold text-green-600">見出し</h3>
    <p class="text-sm leading-relaxed break-words text-ads-muted">説明文</p>
  </div>
</div>

入力データ:
`;

const TRANSCRIPT_EXCERPT_LIMIT = 12_000;

function extractHtmlFragment(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const mainMatch = text.match(/<main[\s\S]*?<\/main>/i);
  if (mainMatch?.[0]) {
    return mainMatch[0]
      .replace(/^<main[^>]*>/i, "")
      .replace(/<\/main>$/i, "")
      .trim();
  }

  return text.trim();
}

function buildVisualExplainerSource(input: {
  title: string;
  summary: SummarySections;
  transcriptExcerpt?: string | null;
}): string {
  const summaryJson = JSON.stringify(input.summary, null, 2);
  const transcriptBlock = input.transcriptExcerpt?.trim()
    ? `\n\n字幕（参考・先頭 ${TRANSCRIPT_EXCERPT_LIMIT.toLocaleString()} 文字まで）:\n${input.transcriptExcerpt.trim()}`
    : "";

  return `タイトル: ${input.title}\n\n要点 JSON:\n${summaryJson}${transcriptBlock}`;
}

export async function generateVisualExplainer(
  input: {
    title: string;
    summary: SummarySections;
    transcriptExcerpt?: string | null;
  },
  context?: Pick<GeminiCallContext, "sessionId">,
): Promise<string> {
  const source = buildVisualExplainerSource(input);
  const models = getModelCandidates();
  let lastError: Error | null = null;
  const usageContext: GeminiCallContext = {
    sessionId: context?.sessionId,
    operation: "diagram",
  };

  for (const modelName of models) {
    try {
      const fragment = extractHtmlFragment(
        await generateWithModelRetry(
          modelName,
          VISUAL_EXPLAINER_PROMPT + source,
          { usage: usageContext },
        ),
      );

      if (!fragment.includes("data-lucide")) {
        throw new Error("図解 HTML の形式が不正です（Lucide アイコンがありません）");
      }

      return assembleVisualExplainerHtml({
        title: input.title,
        description: input.summary.overview.slice(0, 160),
        content: fragment,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryableGeminiError(err)) {
        throw new Error(friendlyGeminiError(err));
      }
    }
  }

  throw new Error(friendlyGeminiError(lastError));
}

const DEFAULT_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY が未設定です。.env.local に API キーを設定してください。",
    );
  }
  return key;
}

function getModelCandidates(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_FALLBACK_MODELS[0]!;
  const extras = (process.env.GEMINI_FALLBACK_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const chain = [primary, ...extras, ...DEFAULT_FALLBACK_MODELS];
  return [...new Set(chain)];
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function isRetryableGeminiError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("503") ||
    message.includes("429") ||
    message.includes("Service Unavailable") ||
    message.includes("Too Many Requests") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("RESOURCE_EXHAUSTED")
  );
}

export function friendlyGeminiError(err: unknown): string {
  if (err instanceof GeminiDailyQuotaExceededError) {
    return err.message;
  }

  const message = err instanceof Error ? err.message : String(err);

  if (
    message.includes("503") ||
    message.includes("high demand") ||
    message.includes("Service Unavailable")
  ) {
    return "Gemini API が混雑しています（503）。1〜2 分待って「要約を再生成」を押してください。";
  }

  if (message.includes("429") || message.includes("Too Many Requests")) {
    return "Gemini API の利用制限に達しました（429）。しばらく待ってから再試行してください。";
  }

  if (message.includes("API key not valid") || message.includes("API_KEY_INVALID")) {
    return "GEMINI_API_KEY が無効です。Google AI Studio でキーを確認してください。";
  }

  return message.replace(/^\[GoogleGenerativeAI Error\]:\s*/, "");
}

function retryDelayMs(attempt: number, retryable: boolean): number {
  if (!retryable) return 1500 * (attempt + 1);
  return [3000, 8000, 15000][attempt] ?? 15000;
}

const CHUNK_CHAR_LIMIT = 80_000;

function extractErrorCode(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err);
  const statusMatch = message.match(/\b(429|503|400|500)\b/);
  if (statusMatch?.[1]) return statusMatch[1];
  if (message.includes("Too Many Requests")) return "429";
  if (message.includes("RESOURCE_EXHAUSTED")) return "429";
  if (message.includes("API key not valid")) return "401";
  return null;
}

async function logGeminiUsage(input: {
  sessionId?: string;
  operation: GeminiCallContext["operation"];
  model: string;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  success: boolean;
  error?: unknown;
}): Promise<void> {
  const errorCode = input.success ? null : extractErrorCode(input.error);
  const payload = {
    sessionId: input.sessionId,
    operation: input.operation,
    model: input.model,
    promptTokens: input.promptTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    totalTokens: input.totalTokens ?? 0,
    latencyMs: input.latencyMs,
    success: input.success,
    errorCode,
  };

  console.info(
    `[gemini-usage] op=${payload.operation} model=${payload.model} tokens=${payload.totalTokens} ok=${payload.success}${errorCode ? ` err=${errorCode}` : ""}${payload.sessionId ? ` session=${payload.sessionId}` : ""}`,
  );

  try {
    await recordGeminiUsage(payload);
  } catch (logErr) {
    console.warn("[gemini-usage] failed to persist usage log", logErr);
  }
}

async function generateWithModelRetry(
  modelName: string,
  prompt: string,
  options?: { json?: boolean; usage?: GeminiCallContext },
): Promise<string> {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(options?.json
      ? { generationConfig: { responseMimeType: "application/json" } }
      : {}),
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const startedAt = Date.now();
    try {
      await waitForGeminiSlot();
      const result = await model.generateContent(prompt);
      const usage = result.response.usageMetadata;
      if (options?.usage) {
        await logGeminiUsage({
          ...options.usage,
          model: modelName,
          promptTokens: usage?.promptTokenCount,
          outputTokens: usage?.candidatesTokenCount,
          totalTokens: usage?.totalTokenCount,
          latencyMs: Date.now() - startedAt,
          success: true,
        });
      }
      return result.response.text().trim();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof GeminiDailyQuotaExceededError) {
        throw err;
      }
      const retryable = isRetryableGeminiError(err);
      const isLastAttempt = attempt >= 2 || !retryable;
      if (options?.usage && isLastAttempt) {
        await logGeminiUsage({
          ...options.usage,
          model: modelName,
          latencyMs: Date.now() - startedAt,
          success: false,
          error: err,
        });
      }
      if (isLastAttempt) break;

      await new Promise((r) =>
        setTimeout(r, retryDelayMs(attempt, true)),
      );
    }
  }

  throw lastError ?? new Error("Gemini API 呼び出しに失敗しました");
}

async function generateSummaryWithModel(
  modelName: string,
  transcript: string,
  usage?: Pick<GeminiCallContext, "sessionId">,
): Promise<SummarySections> {
  try {
    const text = await generateWithModelRetry(
      modelName,
      SUMMARY_PROMPT + transcript,
      {
        json: true,
        usage: { sessionId: usage?.sessionId, operation: "summary" },
      },
    );
    const parsed = JSON.parse(extractJson(text));
    return summarySectionSchema.parse(parsed);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function polishChunkWithModel(
  modelName: string,
  transcript: string,
  usage?: Pick<GeminiCallContext, "sessionId">,
): Promise<string> {
  return generateWithModelRetry(modelName, POLISH_PROMPT + transcript, {
    usage: { sessionId: usage?.sessionId, operation: "polish" },
  });
}

async function summarizeChunk(
  transcript: string,
  usage?: Pick<GeminiCallContext, "sessionId">,
): Promise<SummarySections> {
  const models = getModelCandidates();
  let lastError: Error | null = null;

  for (const modelName of models) {
    try {
      return await generateSummaryWithModel(modelName, transcript, usage);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryableGeminiError(err)) {
        throw new Error(friendlyGeminiError(err));
      }
    }
  }

  throw new Error(friendlyGeminiError(lastError));
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

async function polishChunk(
  transcript: string,
  usage?: Pick<GeminiCallContext, "sessionId">,
): Promise<string> {
  const models = getModelCandidates();
  let lastError: Error | null = null;

  for (const modelName of models) {
    try {
      return await polishChunkWithModel(modelName, transcript, usage);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryableGeminiError(err)) {
        throw new Error(friendlyGeminiError(err));
      }
    }
  }

  throw new Error(friendlyGeminiError(lastError));
}

function splitTranscriptChunks(transcript: string): string[] {
  if (transcript.length <= CHUNK_CHAR_LIMIT) {
    return [transcript];
  }

  const chunks: string[] = [];
  let offset = 0;
  while (offset < transcript.length) {
    chunks.push(transcript.slice(offset, offset + CHUNK_CHAR_LIMIT));
    offset += CHUNK_CHAR_LIMIT;
  }
  return chunks;
}

async function mapSequential<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) {
    results.push(await fn(item));
  }
  return results;
}

export async function polishTranscript(
  transcript: string,
  context?: Pick<GeminiCallContext, "sessionId">,
): Promise<string> {
  const chunks = splitTranscriptChunks(transcript);
  const polished = await mapSequential(chunks, (chunk) =>
    polishChunk(chunk, context),
  );
  return polished.join("\n\n").trim();
}

export async function summarizeTranscript(
  transcript: string,
  context?: Pick<GeminiCallContext, "sessionId">,
): Promise<SummarySections> {
  const chunks = splitTranscriptChunks(transcript);
  if (chunks.length === 1) {
    return summarizeChunk(transcript, context);
  }

  const partials = await mapSequential(chunks, (chunk) =>
    summarizeChunk(chunk, context),
  );
  return mergeSummaries(partials);
}
