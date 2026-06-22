import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GoogleGenerativeAI } from "@google/generative-ai";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function loadEnvLocal() {
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.local が見つかりません。");
    console.error("   cp .env.example .env.local を実行してください。");
    process.exit(1);
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const apiKey = process.env.GEMINI_API_KEY?.trim();
const modelName = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

if (!apiKey) {
  console.error("❌ GEMINI_API_KEY が未設定です。");
  console.error("");
  console.error("手順:");
  console.error("  1. https://aistudio.google.com/apikey で API キーを作成");
  console.error("  2. .env.local の GEMINI_API_KEY= の右にキーを貼り付け");
  console.error("  3. このコマンドを再実行");
  process.exit(1);
}

console.log(`Gemini 接続テスト中… (model: ${modelName})`);

try {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(
    'JSON のみで返答: {"ok":true,"message":"接続成功"}',
  );
  const text = result.response.text().trim();
  console.log("✅ Gemini API に接続できました。");
  console.log(`   応答: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`);
  console.log("");
  console.log("次: npm run dev を再起動し、VidNote で要約を試してください。");
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("❌ Gemini API への接続に失敗しました。");
  console.error(`   ${message}`);
  console.error("");
  console.error("確認事項:");
  console.error("  - API キーが正しくコピーされているか（前後の空白なし）");
  console.error("  - Google AI Studio でキーが有効か");
  console.error(`  - GEMINI_MODEL=${modelName} が利用可能か`);
  process.exit(1);
}
