import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diagramPath = path.join(root, "diagram-workspace", "output", "diagram.html");

let debounce: ReturnType<typeof setTimeout> | null = null;
let importing = false;

function runImport(): void {
  if (importing) return;
  importing = true;

  const child = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "diagram:import"],
    { cwd: root, stdio: "inherit", shell: false },
  );

  child.on("close", () => {
    importing = false;
  });
}

function scheduleImport(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    console.log(`[diagram:watch] ${new Date().toLocaleTimeString("ja-JP")} import...`);
    runImport();
  }, 900);
}

if (!fs.existsSync(diagramPath)) {
  console.error(`Missing: ${diagramPath}`);
  process.exit(1);
}

console.log("[diagram:watch] Watching diagram-workspace/output/diagram.html");
console.log("[diagram:watch] Save from Cursor to auto-import into VidNote DB.");
console.log("[diagram:watch] Press Ctrl+C to stop.");

fs.watch(diagramPath, { persistent: true }, scheduleImport);
