/** What `requestOrigin` reads: a request's headers by name (an Express `Request` fits). */
export interface RequestHeaders {
  get(name: string): string | undefined;
}

/**
 * The web origin the player is using (`https://insidelife.online`, a dev tunnel, the local dev server…): the
 * request's `Origin` header (browsers send it on every POST), else the origin of its `Referer`. Null when neither
 * names an http(s) origin.
 *
 * Not validated beyond that: callers must check it against an allowlist before trusting it (checkout does, via
 * `checkoutReturnUrl` and CORS_ORIGINS). Pass it as `CheckoutRequest.returnOrigin`.
 */
export function requestOrigin(request: RequestHeaders): string | null {
  const origin = request.get('origin')?.trim();
  if (origin && origin !== 'null') return origin;
  const referer = request.get('referer')?.trim();
  if (!referer || !URL.canParse(referer)) return null;
  const { protocol, origin: refererOrigin } = new URL(referer);
  return protocol === 'https:' || protocol === 'http:' ? refererOrigin : null;
}
