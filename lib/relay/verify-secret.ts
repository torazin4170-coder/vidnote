export function verifyRelaySecret(
  authorizationHeader: string | null,
): boolean {
  const secret = process.env.TRANSCRIPT_RELAY_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const expected = `Bearer ${secret}`;
  if (!authorizationHeader) {
    return false;
  }

  if (authorizationHeader.length !== expected.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= authorizationHeader.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
