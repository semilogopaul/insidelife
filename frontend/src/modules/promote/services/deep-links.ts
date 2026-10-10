import { findAdSlot } from '@insidelife/shared';

/**
 * What the Promote app opens on (`openPhone('promote', param)`): the server's notices and other apps link here.
 * - `<slot id>`: book that spot (the house ad on a board).
 * - `campaigns` / `tracks`: the lists.
 * - `campaign:<id>`: an ad's "what you paid for" page.
 * - `song:<orderId>`: a song order's page; `song:<orderId>:<venueId>` also opens "Take me there" for that club.
 */
export type PromoteRoute =
  | { readonly kind: 'boards' }
  | { readonly kind: 'campaigns' }
  | { readonly kind: 'tracks' }
  | { readonly kind: 'book'; readonly slotId: string }
  | { readonly kind: 'campaign'; readonly id: string }
  | { readonly kind: 'song'; readonly orderId: string; readonly venueId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePromoteLink(param: string | null | undefined): PromoteRoute {
  if (!param) return { kind: 'boards' };
  if (param === 'campaigns') return { kind: 'campaigns' };
  if (param === 'tracks') return { kind: 'tracks' };
  const [head, id, venueId] = param.split(':');
  if (head === 'campaign' && id && UUID.test(id)) return { kind: 'campaign', id };
  if (head === 'song' && id && UUID.test(id)) return { kind: 'song', orderId: id, venueId: venueId && /^[a-z0-9-]{2,64}$/.test(venueId) ? venueId : null };
  if (findAdSlot(param)) return { kind: 'book', slotId: param };
  return { kind: 'boards' };
}
