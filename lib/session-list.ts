import type { Session } from "@/lib/schema";

/** サイドバー一覧用。transcript / summary / notes / 図解 HTML は載せない */
export function toSessionListPatch(session: Session): Session {
  return {
    id: session.id,
    youtubeUrl: session.youtubeUrl,
    youtubeId: session.youtubeId,
    title: session.title,
    thumbnailUrl: session.thumbnailUrl,
    durationSec: session.durationSec,
    status: session.status,
    categoryId: session.categoryId,
    categoryName: session.categoryName,
    transcriptRaw: null,
    transcript: null,
    summaryJson: null,
    hasVisualExplainer: session.hasVisualExplainer,
    visualExplainerHtml: null,
    notesHtml: null,
    errorMessage: session.errorMessage,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/** API レスポンス用。図解 HTML 本体はクライアントへ送らない */
export function sanitizeSessionForClient(session: Session): Session {
  return {
    ...session,
    visualExplainerHtml: null,
  };
}
