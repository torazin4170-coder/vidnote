import { listSessionSummaries } from "@/lib/db/sessions";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { Workspace } from "@/components/workspace/Workspace";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sessions = await listSessionSummaries();

  return (
    <Workspace
      initialSessions={sessions}
      geminiConfigured={isGeminiConfigured()}
    />
  );
}
