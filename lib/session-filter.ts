import type { CategoryFilter, Session } from "@/lib/schema";

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function sessionMatchesSearch(session: Session, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    session.title,
    session.youtubeUrl,
    session.youtubeId,
    session.categoryName,
    stripHtml(session.notesHtml),
    session.transcript,
    session.summaryJson?.overview,
    ...(session.summaryJson?.keyPoints ?? []),
    ...(session.summaryJson?.frameworkViews?.flatMap((view) => [
      view.framework,
      view.title,
      ...view.items,
    ]) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export function sessionMatchesCategoryFilter(
  session: Session,
  filter: CategoryFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "uncategorized") return session.categoryId == null;
  return session.categoryId === filter;
}

export function filterSessions(
  sessions: Session[],
  options: {
    searchQuery: string;
    categoryFilter: CategoryFilter;
  },
): Session[] {
  return sessions.filter(
    (session) =>
      sessionMatchesCategoryFilter(session, options.categoryFilter) &&
      sessionMatchesSearch(session, options.searchQuery),
  );
}
