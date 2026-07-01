import { buildSessionTargetJson } from "@/lib/visual-explainer/import-diagram";

export function downloadSessionTargetFile(input: {
  sessionId: string;
  title?: string | null;
}): void {
  const json = buildSessionTargetJson(input);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "session.target.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
