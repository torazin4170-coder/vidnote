import { listCategories } from "@/lib/db/categories";
import { listSessionSummaries } from "@/lib/db/sessions";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { Workspace } from "@/components/workspace/Workspace";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [sessions, categories] = await Promise.all([
    listSessionSummaries(),
    listCategories(),
  ]);

  return (
    <Workspace
      initialSessions={sessions}
      initialCategories={categories}
      geminiConfigured={isGeminiConfigured()}
    />
  );
}
