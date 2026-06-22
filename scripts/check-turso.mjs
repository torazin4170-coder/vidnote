import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function loadEnvLocal() {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const url = process.env.TURSO_DATABASE_URL?.trim() || "file:data/sessions.db";
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

const client = createClient({
  url,
  authToken: url.startsWith("file:") ? undefined : authToken,
});

try {
  const result = await client.execute(
    "SELECT COUNT(*) AS count FROM sessions",
  );
  const count = Number(result.rows[0]?.count ?? 0);
  const mode = url.startsWith("file:")
    ? "ローカルファイル（file:data/sessions.db）"
    : "Turso クラウド";

  console.log(`✅ データベースに接続できました。（${mode}）`);
  console.log(`   セッション数: ${count} 件`);

  if (url.startsWith("file:")) {
    console.log("");
    console.log("ローカルモードで動作中です。別端末・Vercel 公開には Turso クラウド URL を設定してください。");
    console.log("手順: https://turso.tech/app で DB 作成 → .env.local に URL とトークンを設定");
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("❌ データベース接続に失敗しました。");
  console.error(`   ${message}`);
  console.error("");
  console.error("確認事項:");
  console.error("  - npm run db:init を実行したか");
  console.error("  - TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が正しいか");
  process.exit(1);
}
