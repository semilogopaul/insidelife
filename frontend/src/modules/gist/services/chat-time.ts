/** Chat timestamps in real time, relative ("now", "4m", "3h", "Tue"), so they never clash with the game clock. */
export function chatTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(iso).toLocaleDateString('en-NG', { weekday: 'short' });
}
