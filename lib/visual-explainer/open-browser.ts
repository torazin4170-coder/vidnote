import { spawnSync } from "node:child_process";

export function openBrowser(url: string): void {
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

export function openLocalHtmlFile(filePath: string): void {
  const normalized = filePath.replace(/\\/g, "/");
  openBrowser(`file:///${normalized}`);
}
