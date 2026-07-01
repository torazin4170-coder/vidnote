export type SessionTargetFile = {
  sessionId: string;
  title?: string | null;
  updatedAt?: string;
};

export function parseSessionTargetJson(raw: string): SessionTargetFile {
  const parsed = JSON.parse(raw) as SessionTargetFile;
  const sessionId = parsed.sessionId?.trim();
  if (!sessionId) {
    throw new Error("session.target.json に sessionId がありません");
  }
  return {
    sessionId,
    title: parsed.title ?? null,
    updatedAt: parsed.updatedAt,
  };
}

export function buildSessionTargetJson(input: {
  sessionId: string;
  title?: string | null;
}): string {
  return `${JSON.stringify(
    {
      sessionId: input.sessionId,
      title: input.title ?? null,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`;
}
