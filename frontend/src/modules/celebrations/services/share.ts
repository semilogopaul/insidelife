export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Share a moment with the Web Share API; fall back to copying the text. */
export async function shareMoment(title: string, text: string): Promise<ShareOutcome> {
  const url = typeof window === 'undefined' ? '' : window.location.origin;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
