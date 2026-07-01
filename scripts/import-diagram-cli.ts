import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createClient } from "@libsql/client";

import { prepareImportedDiagramHtml } from "@/lib/visual-explainer/import-diagram";
import { parseSessionTargetJson } from "@/lib/visual-explainer/session-target";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDir = path.join(root, "diagram-workspace");
const sessionTargetPath = path.join(workspaceDir, "session.target.json");
const diagramPath = path.join(workspaceDir, "output", "diagram.html");
const envPath = path.join(root, ".env.local");

function loadEnvLocal(): void {
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

function resolveDatabaseUrl(): string {
  const configured = process.env.TURSO_DATABASE_URL?.trim();
  if (configured) return configured;
  return "file:data/sessions.db";
}

function getVidNoteUrl(): string {
  return (
    process.env.VIDNOTE_URL?.trim() || "https://vidnote-alpha.vercel.app"
  ).replace(/\/$/, "");
}

function descriptionFromSummary(summaryJson: string | null): string | null {
  if (!summaryJson?.trim()) return null;
  try {
    const parsed = JSON.parse(summaryJson) as { overview?: string };
    return parsed.overview?.trim().slice(0, 160) ?? null;
  } catch {
    return null;
  }
}

function openBrowser(url: string): void {
  if (process.platform === "win32") {
    spawnSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
    return;
  }
  if (process.platform === "darwin") {
    spawnSync("open", [url], { stdio: "ignore" });
    return;
  }
  spawnSync("xdg-open", [url], { stdio: "ignore" });
}

const DIAGRAM_IMPORT_TARGET_KEY = "diagram_import_target";

async function resolveSessionId(
  db: ReturnType<typeof createClient>,
  sessionArg: string,
): Promise<{ sessionId: string; targetTitle: string | null }> {
  if (sessionArg) {
    return { sessionId: sessionArg, targetTitle: null };
  }

  const settingResult = await db.execute({
    sql: "SELECT value FROM app_settings WHERE key = ?",
    args: [DIAGRAM_IMPORT_TARGET_KEY],
  });
  const settingRow = settingResult.rows[0] as
    | { value?: string }
    | undefined;
  if (settingRow?.value) {
    try {
      const parsed = JSON.parse(String(settingRow.value)) as {
        sessionId?: string;
        title?: string | null;
      };
      const sessionId = parsed.sessionId?.trim();
      if (sessionId) {
        return {
          sessionId,
          targetTitle: parsed.title?.trim() ?? null,
        };
      }
    } catch {
      // fall through to legacy file
    }
  }

  if (fs.existsSync(sessionTargetPath)) {
    const target = parseSessionTargetJson(
      fs.readFileSync(sessionTargetPath, "utf8"),
    );
    return {
      sessionId: target.sessionId,
      targetTitle: target.title?.trim() ?? null,
    };
  }

  console.error(
    "取り込み先セッションが未登録です。VidNote で「Cursor 用にコピー」を押してください。",
  );
  console.error("または: npm run diagram:import -- --session=SESSION_ID");
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnvLocal();

  const sessionArg =
    process.argv
      .find((arg) => arg.startsWith("--session="))
      ?.slice("--session=".length)
      .trim() ?? "";

  if (!fs.existsSync(diagramPath)) {
    console.error(`diagram.html がありません: ${diagramPath}`);
    process.exit(1);
  }

  const rawHtml = fs.readFileSync(diagramPath, "utf8");
  const url = resolveDatabaseUrl();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  const db = createClient({
    url,
    authToken: url.startsWith("file:") ? undefined : authToken,
  });

  const { sessionId, targetTitle } = await resolveSessionId(db, sessionArg);

  const sessionResult = await db.execute({
    sql: `SELECT title, youtube_url, summary_json FROM sessions WHERE id = ?`,
    args: [sessionId],
  });
  const row = sessionResult.rows[0] as
    | { title?: string | null; youtube_url?: string; summary_json?: string | null }
    | undefined;

  if (!row) {
    console.error(`セッションが見つかりません: ${sessionId}`);
    process.exit(1);
  }

  const title =
    String(row.title ?? "").trim() ||
    targetTitle ||
    String(row.youtube_url ?? "VidNote 図解");

  const html = prepareImportedDiagramHtml({
    rawHtml,
    title,
    description: descriptionFromSummary(
      row.summary_json != null ? String(row.summary_json) : null,
    ),
  });

  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE sessions
          SET visual_explainer_html = ?, status = 'done', error_message = NULL, updated_at = ?
          WHERE id = ?`,
    args: [html, now, sessionId],
  });

  const openUrl = `${getVidNoteUrl()}/?session=${encodeURIComponent(sessionId)}&open=diagram`;
  console.log(`Imported diagram for session: ${sessionId}`);
  console.log(`Title: ${title}`);
  console.log(`Opening: ${openUrl}`);
  openBrowser(openUrl);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
