export function isVercel(): boolean {
  return process.env.VERCEL === "1";
}

export function isYtdlpAvailable(): boolean {
  return !isVercel();
}
