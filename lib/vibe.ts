export const VIBE_EMOJIS = ['😌', '🔥', '😴', '🥳', '😤', '😭', '💪', '☕'];

export const VIBE_LABELS: Record<string, string> = {
  '😌': 'chill',
  '🔥': 'hyped',
  '😴': 'tired',
  '🥳': 'party',
  '😤': 'fired up',
  '😭': 'sad',
  '💪': 'strong',
  '☕': 'cozy',
};

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
}