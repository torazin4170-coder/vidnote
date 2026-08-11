/**
 * Normalize TRANSCRIPT_RELAY_URL from env (trim, strip accidental prompt chars).
 */
export function normalizeRelayUrl(raw: string | undefined): string {
  const cleaned = (raw ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^[?#\s]+/, "")
    .replace(/\/$/, "");

  if (!cleaned) {
    throw new Error("TRANSCRIPT_RELAY_URL が未設定です");
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    throw new Error(
      `TRANSCRIPT_RELAY_URL が不正です: ${cleaned.slice(0, 80)}`,
    );
  }
}
