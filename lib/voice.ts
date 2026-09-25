export const VOICE_PREFIX = '[VOICE]';

export function formatVoiceContent(url: string, duration: number): string {
  return `${VOICE_PREFIX}${url}|${Math.max(1, Math.round(duration))}`;
}

export function parseVoiceContent(
  content: string
): { url: string; duration: number } | null {
  if (!content || !content.startsWith(VOICE_PREFIX)) return null;
  const rest = content.slice(VOICE_PREFIX.length);
  const pipe = rest.lastIndexOf('|');
  if (pipe === -1) return null;
  const url = rest.slice(0, pipe);
  const dur = parseInt(rest.slice(pipe + 1), 10);
  if (!url) return null;
  return { url, duration: isFinite(dur) && dur > 0 ? dur : 0 };
}