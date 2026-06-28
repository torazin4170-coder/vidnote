import { GoogleGenerativeAI } from "@google/generative-ai";

import { assembleVisualExplainerHtml } from "@/lib/visual-explainer/assemble";
import { fixChartBarScales } from "@/lib/visual-explainer/fix-chart-bars";
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
複雑な内容は、内容に合った「思考フレームワーク」を選び、構造的に理解できるように整理してください。

## フレームワークの選び方（0〜3個・図解用の参考データ）
frameworkViews は図解生成の**参考メモ**（UI非表示）。**無理に埋めない**。単純な動画・データが少ない動画は \`"frameworkViews": []\` でよい。
内容が複雑なときだけ、最も役立つ思考法を選ぶ（2〜3個まで）。

### 分解・整理（decompose）
- MECE: 漏れなく重複なく要素を整理
- ロジックツリー: 問題・原因・解決策を段階的に分解
- 5W1H: Who/What/When/Where/Why/How で状況を整理
- マインドマップ: 中心概念から連想・枝を広げる
- KJ法: バラバラな要素をグループ化して構造を見出す

### 構造・関係性（structure）
- 因果ループ: 要素間の因果・フィードバックループ
- 2軸マトリクス: 2軸で4象限に分類（重要度×緊急度など）
- プロセスマップ: 手順・フローを時系列で整理
- タイムライン: 時系列とマイルストーン

### 本質抽出（essence）
- ファインマン: 専門用語なしで平易に説明した要点
- 抽象化: 具体例から共通の原理・パターンを抽出
- アナロジー: 身近な例えで構造を説明
- 第一原理: 前提を疑い、根源的事実から再整理

### 視点変更（perspective）
- 6つの帽子: 客観/感情/否定/肯定/創造/統括の視点
- PEST: 政治・経済・社会・技術のマクロ視点
- 3C: 顧客・競合・自社（該当時）

## 出力ルール
- overview / keyPoints / terms / actions は従来どおり（AI 要点 UI に表示）
- frameworkViews は **図解生成専用**（UI 非表示）。2〜4個選び items は3〜7行
- framework にはフレームワーク名（例: "MECE", "5W1H", "ファインマン"）
- approach は decompose | structure | essence | perspective のいずれか
- 動画にない内容を創作しない。字幕に基づく

必ず次の JSON 形式のみを返してください。Markdown や説明文は不要です。

{
  "overview": "2〜4文の概要",
  "keyPoints": ["重要ポイント1", "重要ポイント2"],
  "terms": [{ "term": "用語", "definition": "説明" }],
  "actions": ["学習者が取るべきアクション1"],
  "frameworkViews": [
    {
      "framework": "5W1H",
      "approach": "decompose",
      "title": "状況整理",
      "items": ["Who: ...", "What: ..."]
    }
  ]
}

文字起こし:
`;

const VISUAL_EXPLAINER_PROMPT = `あなたは図解 HTML を生成するアシスタントです。
YouTube 動画の要点を、初めて聞く人にもわかる高品質な図解ページの <main> 内コンテンツとして出力してください。

## 出力ルール（厳守）
- 出力は <main> タグの中身のみ（DOCTYPE / html / head / body / script は含めない）
- Tailwind CSS クラスのみでスタイリング（<style> タグ・style 属性は禁止）
- アイコンは Lucide Icons の <i data-lucide="アイコン名" class="w-8 h-8"> のみ（SVG 直書き禁止）
- 絵文字禁止。React / shadcn 禁止。インタラクティブ要素禁止
- 追加の <script> 禁止。外部画像 URL 禁止
- 日本語で書く。概論→各論。専門用語は初出で平易に解説

## 構造的整理（frameworkViews）— 参考材料（テンプレ強制しない）
\`frameworkViews\` があれば **図解の設計ヒント** として参照する。フレームワーク名（5W1H・マトリクス等）を見出しにそのまま出す必要はない。

### 最優先: 動画内容に合った「明示の仕方」を選ぶ
各セクションを作る前に、その塊が何を伝えているか判定し、最適な1パターンを選ぶ:

| 内容の型 | 図解パターン（例） |
|---------|-------------------|
| A vs B・良い/悪い | 左右2列カード |
| 数値・割合・研究結果 | 比較バー（縮尺厳守） |
| 手順・フロー | 番号ステップ縦並び |
| 核心の一言・判断基準 | 中央メッセージカード |
| 印象的な発言 | 引用ボックス |
| 独立した論点が並ぶ | keyPoint ごとに**それぞれ別パターン**（全部同型にしない） |
| 時系列・歴史 | タイムライン風リスト |

frameworkViews は上表の**補助**（MECE→漏れのないリスト、マトリクス→2軸が本当に意味あるときだけ、等）。**frameworkViews が空でも keyPoints + 字幕から最適レイアウトを選ぶ。**

### 避けること
- 全セクションを5W1H表や2×2マトリクスに統一する
- フレームワーク名バッジを毎セクション付ける
- frameworkViews の項目数 = セクション数 の機械的対応

## レイアウト品質（最重要・厳守）
重なり・不自然な空白・バランス崩れを絶対に起こさないこと。

禁止:
- position: absolute / relative による重ね合わせ（absolute / relative クラス禁止）
- 負の margin、translate、inset、overlap 目的の grid/flex
- 放射状・半円状・円周配置など座標指定が必要なレイアウト
- アイコンと本文を同一行に詰め込む（flex-row で icon+長文を横並びにしない）
- 矢印アイコンをテキストの上に重ねる
- 細いバー内部にラベルや長い数値を入れる（数値はバーの外側に置く）

必須:
- セクション間は \`mb-12\`。カード間は \`gap-6\`
- カード基本形: \`rounded-xl border border-ads-border bg-ads-surface p-5\`
- 長文は \`text-sm leading-relaxed break-words text-ads-muted text-left\`
- 見出しは \`text-lg font-bold\` または \`text-xl font-bold\`
- アイコンは \`w-10 h-10\`、背景付き円 \`rounded-full p-3\` の中に置く

## テキスト強調（控えめ・模範品質）
参考トーン: [第4回講義図解](https://ads_lecture_4_diagram.surge.sh/) / [Inside Stories 図解](https://stories-image.vercel.app/posts/2426)

**色は構造（カード見出し・バッジ・対比レイアウト）に使い、本文段落への赤・青・緑の多用は避ける。**

### 本文・説明文（基本）
- 基調: \`text-sm leading-relaxed text-ads-muted text-left\`
- 通常の強調（最優先）: \`<span class="font-bold text-ads-text">語句</span>\`
- やや弱い強調: \`<span class="font-semibold text-ads-text">語句</span>\`
- 1段落あたり太字強調は **1〜3語句** まで。全部を強調しない

### 色付き span（本文では最小限）
- **セクション全体で色付き span は 0〜2 箇所**（本当に核心の1語のみ）
- 使ってよい: \`<span class="font-bold text-ads-accent">核心語</span>\`（1セクション最大1回）
- 警告の核心1語のみ: \`<span class="font-bold text-red-600">語句</span>\`（教訓ボックス内に限定可）
- **禁止**: 本文段落内に赤・青・緑を2色以上混在 / マーカー背景 \`bg-*\` の多用 / すべてのキーワードに色

### 色を使ってよい場所（レイアウト用途）
- 左右対比カードの **列見出し**（×側=h3 赤、✓側=h3 緑）とアイコン
- 番号バッジ・Part ラベル・引用ボックスの **枠と見出しラベル**
- グラフのバー・数値ラベル
- リスト行の番号丸（amber/green/blue）— 行内本文は \`text-ads-muted\` + 太字

### 引用ボックス内
- 本文は \`text-ads-muted italic\`。強調は **太字** が基本
- 色付き span は引用 **1つにつき最大1語**
\`\`\`
<p class="text-sm leading-relaxed text-ads-muted italic text-left">「<span class="font-bold text-ads-text">削除してコミット</span>すればいいんです。<span class="font-bold text-ads-text">プロになればなるほど</span>1人でもブランチを切って開発しています」</p>
\`\`\`

## 数値・統計の視覚化（内容に含まれる場合は必須）
動画に割合・比較・ランキング・研究データ・「○倍」「○%」などがあれば、テキストだけにせずグラフ化する。

### グラフ品質（厳守・よくあるミスを避ける）
1. **塗り必須**: トラック内に \`<div class="h-full bg-*-500 rounded-full bar-w-XX"></div>\` を必ず入れる
2. **同一グラフ内の縮尺（最重要）**:
   - そのグラフ内の**最大値を M** とする（例: 100% と 117% なら M=117）
   - 各バー幅 = 値 ÷ M × 100% を \`bar-w-XX\` に変換（最大値の行だけ \`bar-w-full\`）
   - **数値が大きい行ほどバーが長くなる**こと。117%のバーが100%より短いのは致命的エラー
   - 例（基準100% vs 117%）: 100%→\`bar-w-85\`（100÷117≈85%）、117%→\`bar-w-full\`
   - 例（17% vs 2%・最大17%）: 17%→\`bar-w-full\`、2%→\`bar-w-10\`（2÷17≈12%）
   - 例（0〜100%スケール）: 17%→\`bar-w-20\`、2%→\`bar-w-10\`
3. **出力前チェック**: 同一グラフで label の数値 A > B なら、A の bar-w が B より大きいクラスであること
4. **「+○%」比較**: 基準100%と結果117%など、必ず2行。単一バーに「約17%」だけ書かない
5. **2項目比較**: 同じ長さ・空トラック禁止

幅クラス（小→大）: bar-w-10 / bar-w-20 / bar-w-25 / bar-w-33 / bar-w-40 / bar-w-50 / bar-w-66 / bar-w-75 / bar-w-85 / bar-w-full
※ 中間値は最も近いクラスを選ぶ（85%付近→bar-w-85、12%付近→bar-w-10）

### プログレスバー（割合・注意力の比較）
\`\`\`
<div class="flex flex-col gap-2 mb-3">
  <p class="text-sm text-ads-text text-left">ラベル</p>
  <div class="flex items-center gap-3">
    <div class="flex-1 h-4 rounded-full bg-ads-hover overflow-hidden">
      <div class="h-full bg-green-500 rounded-full bar-w-full"></div>
    </div>
    <span class="text-sm font-bold text-green-600 flex-shrink-0">100%</span>
  </div>
</div>
\`\`\`

### 2項目比較バー（信頼度・迎合度など）
\`\`\`
<div class="rounded-xl border border-ads-border bg-ads-surface p-5 mb-4">
  <p class="text-sm font-bold text-ads-text mb-4 text-left">AIの「信頼度」評価</p>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <span class="text-sm text-ads-text w-24 flex-shrink-0 text-left">迎合的AI</span>
      <div class="flex-1 h-4 rounded-full bg-ads-hover overflow-hidden">
        <div class="h-full bg-red-500 rounded-full bar-w-75"></div>
      </div>
      <span class="text-sm font-bold text-red-600 flex-shrink-0">高</span>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-sm text-ads-text w-24 flex-shrink-0 text-left">非迎合的AI</span>
      <div class="flex-1 h-4 rounded-full bg-ads-hover overflow-hidden">
        <div class="h-full bg-blue-500 rounded-full bar-w-40"></div>
      </div>
      <span class="text-sm font-bold text-blue-600 flex-shrink-0">低</span>
    </div>
  </div>
  <p class="text-xs text-ads-dim text-center mt-3">→ 同一スケールでの比較</p>
</div>
\`\`\`

### 「基準100% + 増分」比較（117%など）
同一グラフ内 M=117 の例:
\`\`\`
<div class="flex items-center gap-3 mb-3">
  <span class="text-sm text-ads-text w-16 flex-shrink-0 text-left">基準</span>
  <div class="flex-1 h-4 rounded-full bg-ads-hover overflow-hidden">
    <div class="h-full bg-blue-500 rounded-full bar-w-85"></div>
  </div>
  <span class="text-sm font-bold text-blue-600 flex-shrink-0">100%</span>
</div>
<div class="flex items-center gap-3 mb-3">
  <span class="text-sm text-ads-text w-16 flex-shrink-0 text-left">白人写真</span>
  <div class="flex-1 h-4 rounded-full bg-ads-hover overflow-hidden">
    <div class="h-full bg-green-500 rounded-full bar-w-full"></div>
  </div>
  <span class="text-sm font-bold text-green-600 flex-shrink-0">117%（+17%）</span>
</div>
\`\`\`

### 絶対値の比較（17% vs 2%・最大17%）
\`\`\`
<div class="flex items-center gap-3 mb-3">
  <span class="text-sm text-ads-text w-16 flex-shrink-0 text-left">男性</span>
  <div class="flex-1 h-4 rounded-full bg-ads-hover overflow-hidden">
    <div class="h-full bg-red-500 rounded-full bar-w-full"></div>
  </div>
  <span class="text-sm font-bold text-red-600 flex-shrink-0">17%</span>
</div>
<div class="flex items-center gap-3 mb-3">
  <span class="text-sm text-ads-text w-16 flex-shrink-0 text-left">女性</span>
  <div class="flex-1 h-4 rounded-full bg-ads-hover overflow-hidden">
    <div class="h-full bg-blue-500 rounded-full bar-w-10"></div>
  </div>
  <span class="text-sm font-bold text-blue-600 flex-shrink-0">2%</span>
</div>
\`\`\`

### 横棒グラフ（順位・序列効果・ランキング）
各行: 左ラベル（固定幅 w-16 text-left）+ 右バー（flex-1）。行は \`flex items-center gap-3 mb-3\`
\`\`\`
<div class="flex items-center gap-3 mb-3">
  <span class="text-sm text-ads-text w-16 flex-shrink-0 text-left">最初</span>
  <div class="flex-1 h-5 rounded bg-ads-hover overflow-hidden">
    <div class="h-full bg-blue-500 rounded bar-w-full"></div>
  </div>
</div>
<div class="flex items-center gap-3 mb-3">
  <span class="text-sm text-ads-text w-16 flex-shrink-0 text-left">真ん中</span>
  <div class="flex-1 h-5 rounded bg-ads-hover overflow-hidden">
    <div class="h-full bg-red-500 rounded bar-w-25"></div>
  </div>
</div>
\`\`\`
グラフ下に \`text-xs text-ads-dim text-center\` で軸ラベル（例: → 注目度の高さ）

## ページ構成
1. 冒頭ヒーロー: バッジ＋動画タイトル＋2〜3文の概要（太字強調中心、色は1語まで）
2. 全体サマリー: 1枚絵（グリッド or フロー）
3. 以降: 重要ポイントごとに「セクション」単位で深掘り（説明文だけの段落は最小限）

## セクション構成（各 keyPoint ごとに1ブロック）
\`\`\`
<section class="mb-12">
  <!-- 見出し行: 番号バッジ + タイトル -->
  <div class="flex items-start gap-3 mb-2">
    <span class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-ads-accent/10 text-ads-accent font-bold text-sm">01</span>
    <h2 class="text-xl font-bold text-ads-text">セクションタイトル</h2>
  </div>
  <!-- 問いかけサブタイトル -->
  <p class="text-sm text-ads-dim mb-6 ml-11">「〜では？」という視聴者の疑問</p>
  <!-- ビジュアル本体（下記パターンから選択） -->
  ...
  <!-- 補足本文（太字強調中心。色付き span は0〜1） -->
  <p class="text-sm leading-relaxed text-ads-muted mt-4">...</p>
  <!-- 引用ボックス（動画内の印象的な発言があれば） -->
  ...
</section>
\`\`\`

## ビジュアルパターン（内容に応じて最適なものを選ぶ）

### A. 左右対比（良い vs 悪い・Before vs After）
\`grid grid-cols-1 sm:grid-cols-2 gap-6\`。左=赤系ボーダー（×）、右=緑系ボーダー（✓）。**色は h3 見出しとアイコンのみ**。リスト本文・フッター文は \`text-ads-muted\` + \`font-bold text-ads-text\` で強調。

### B. 判断基準・核心メッセージ
中央寄せカード。大見出しは \`text-xl font-bold text-ads-text\`。核心語1つだけ \`font-black text-ads-accent\` または \`font-black text-red-600\`。補足説明は \`text-ads-muted\` + 太字。

### C. 番号付きステップ（戦略の積み上げ）
\`flex flex-col gap-3\` で行を縦積み。各行: 番号丸（色付き）+ 見出し \`font-bold text-ads-text\` + 説明 \`text-ads-muted\`。\`text-left\`。
番号丸の色のみ amber/green/blue。行内本文に赤緑青を付けない。

### D. 結論ボックス（× 不安 → ✓ 結論）
1枚カード内に2行: 1行目 ×アイコン+ \`font-bold text-red-600\` の短いラベル、2行目 ✓+ \`font-bold text-green-600\` の短いラベル。下の説明文は \`text-ads-muted\` + \`font-bold text-ads-text\` のみ（色 span 禁止）。

### E. 教訓・警告ボックス
\`rounded-xl border border-red-500/30 bg-red-500/10 p-5\`。見出し行のみ \`font-bold text-red-600\`。本文は \`text-ads-muted\` + 太字強調。

### F. 引用ボックス（印象的な発言）
\`rounded-xl border border-ads-accent/30 bg-ads-accent/5 p-5 border-l-4 border-l-ads-accent\`
見出しラベルのみ \`text-ads-accent\`。本文は italic + 太字（色 span は最大1語）

## 参考パターン（左右対比 + 引用）
<div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
  <div class="rounded-xl border border-red-500/20 bg-red-500/10 p-5">
    <div class="flex items-center gap-2 mb-4">
      <i data-lucide="x" class="w-5 h-5 text-red-600"></i>
      <h3 class="text-lg font-bold text-red-600">ファイル名管理</h3>
    </div>
    <div class="flex flex-col gap-2 mb-4">
      <div class="rounded-lg border border-red-500/20 px-3 py-2 text-sm text-ads-muted text-left">企画書_最終版.docx</div>
      <div class="rounded-lg border border-red-500/20 px-3 py-2 text-sm text-ads-muted text-left">企画書_最終版_v2.docx</div>
    </div>
    <p class="text-sm text-ads-muted text-left"><span class="font-bold text-ads-text">どれが本物かわからなくなる</span></p>
  </div>
  <div class="rounded-xl border border-green-500/20 bg-green-500/10 p-5">
    <div class="flex items-center gap-2 mb-4">
      <i data-lucide="check" class="w-5 h-5 text-green-600"></i>
      <h3 class="text-lg font-bold text-green-600">Git 管理</h3>
    </div>
    <div class="flex flex-col gap-2 mb-4">
      <div class="rounded-lg border border-green-500/20 px-3 py-2 text-sm text-left"><span class="font-bold text-ads-text">企画書.md</span> <span class="font-semibold text-ads-text">（常に最新）</span></div>
      <div class="rounded-lg border border-ads-border px-3 py-2 text-sm text-ads-dim text-left">commit: 予算セクション追加</div>
    </div>
    <p class="text-sm text-ads-muted text-left"><span class="font-bold text-ads-text">最新は1つ。過去にいつでも戻れる</span></p>
  </div>
</div>
<div class="rounded-xl border border-ads-accent/30 bg-ads-accent/5 p-5 border-l-4 border-l-ads-accent mb-10">
  <div class="flex items-center gap-2 mb-3">
    <i data-lucide="quote" class="w-5 h-5 text-ads-accent"></i>
    <h3 class="font-bold text-ads-accent">ひとこと</h3>
  </div>
  <p class="text-sm leading-relaxed text-ads-muted italic text-left">「<span class="font-bold text-ads-text">削除してコミット</span>すればいいんです。<span class="font-bold text-ads-text">プロになればなるほど</span>1人でもブランチを切って開発しています」</p>
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
  const { frameworkViews, ...displaySummary } = input.summary;
  const summaryBlock = JSON.stringify(displaySummary, null, 2);
  const frameworkBlock =
    frameworkViews.length > 0
      ? `\n\n構造的整理（frameworkViews）— 図解レイアウトの参考。テンプレ名の表示は不要。内容に合うパターンへ変換すること:\n${JSON.stringify(frameworkViews, null, 2)}`
      : "";
  const transcriptBlock = input.transcriptExcerpt?.trim()
    ? `\n\n字幕（参考・先頭 ${TRANSCRIPT_EXCERPT_LIMIT.toLocaleString()} 文字まで）:\n${input.transcriptExcerpt.trim()}`
    : "";

  return `タイトル: ${input.title}\n\n要点 JSON:\n${summaryBlock}${frameworkBlock}${transcriptBlock}`;
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
        content: fixChartBarScales(fragment),
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
  const frameworkViews = parts.flatMap((p) => p.frameworkViews ?? []);
  const seen = new Set<string>();
  const uniqueFrameworkViews = frameworkViews.filter((view) => {
    const key = `${view.framework}:${view.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    overview: parts.map((p) => p.overview).join("\n\n"),
    keyPoints: [...new Set(parts.flatMap((p) => p.keyPoints))],
    terms: parts.flatMap((p) => p.terms),
    actions: [...new Set(parts.flatMap((p) => p.actions))],
    frameworkViews: uniqueFrameworkViews,
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
