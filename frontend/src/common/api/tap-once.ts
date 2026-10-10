import { newIdempotencyKey } from '@/common/utils/money-input';

/**
 * "Tap once" purchases. Each intent (what is being bought, e.g. `shop:rice-50kg:2`) keeps one idempotency key until it
 * goes through, so a retry after a dropped response gets the server's stored result instead of buying twice; a second
 * tap while the first is still in flight shares that same request. Once it succeeds the key is released, so buying the
 * same thing again later is a new purchase.
 */
const keys = new Map<string, string>();
const inFlight = new Map<string, Promise<unknown>>();

export function tapOnce<T>(intent: string, send: (idempotencyKey: string) => Promise<T>): Promise<T> {
  const running = inFlight.get(intent);
  if (running) return running as Promise<T>;
  const key = keys.get(intent) ?? newIdempotencyKey();
  keys.set(intent, key);
  const request = send(key)
    .then((result) => {
      keys.delete(intent);
      return result;
    })
    .finally(() => inFlight.delete(intent));
  inFlight.set(intent, request);
  return request;
}
