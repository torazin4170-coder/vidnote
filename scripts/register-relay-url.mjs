import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const tunnelUrl = process.argv[2]?.trim();
if (!tunnelUrl) {
  console.error("Usage: node scripts/register-relay-url.mjs <tunnel-url>");
  process.exit(2);
}

const appUrl = (
  process.env.VIDNOTE_APP_URL?.trim() || "https://vidnote-alpha.vercel.app"
).replace(/\/$/, "");
const secret = process.env.TRANSCRIPT_RELAY_SECRET?.trim();

if (!secret) {
  console.error(
    "TRANSCRIPT_RELAY_SECRET が未設定です。.env.local または Relay 起動スクリプトで設定してください。",
  );
  process.exit(1);
}

const endpoint = `${appUrl}/api/relay/register`;
const maxAttempts = 3;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ url: tunnelUrl }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data.error ?? res.statusText;
      if (attempt < maxAttempts) {
        console.warn(
          `Register attempt ${attempt}/${maxAttempts} failed (HTTP ${res.status}): ${msg}`,
        );
        await new Promise((r) => setTimeout(r, attempt * 3000));
        continue;
      }
      console.error(`Register failed (HTTP ${res.status}): ${msg}`);
      process.exit(1);
    }

    console.log(`Registered relay URL: ${data.url ?? tunnelUrl}`);
    console.log(data.message ?? "OK");
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (attempt < maxAttempts) {
      console.warn(`Register attempt ${attempt}/${maxAttempts} failed: ${msg}`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
      continue;
    }
    console.error(`Register failed: ${msg}`);
    process.exit(1);
  }
}
