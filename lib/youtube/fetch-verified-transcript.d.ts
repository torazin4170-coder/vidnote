export function fetchVerifiedTranscriptItems(
  videoId: string,
): Promise<{ offset: number; text: string }[]>;
