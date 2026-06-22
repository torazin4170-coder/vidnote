import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE_NAME = "vidnote_session";

export function isAuthEnabled(): boolean {
  return Boolean(process.env.SITE_PASSWORD?.trim());
}

export function getAuthToken(): string | null {
  const password = process.env.SITE_PASSWORD?.trim();
  if (!password) return null;
  return createHmac("sha256", password).update("vidnote").digest("hex");
}

export function verifyPassword(input: string): boolean {
  const expected = process.env.SITE_PASSWORD?.trim();
  if (!expected) return true;

  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAuthenticatedSession(cookieValue: string | undefined): boolean {
  if (!isAuthEnabled()) return true;
  const token = getAuthToken();
  if (!token || !cookieValue) return false;
  if (cookieValue.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(cookieValue), Buffer.from(token));
}
