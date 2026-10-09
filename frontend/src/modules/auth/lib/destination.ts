import type { AuthUserDto } from '@insidelife/shared';

/** Same-site path only (never `//evil.com` or an absolute URL). */
const isSafePath = (path: string | null): path is string =>
  path !== null && path.startsWith('/') && !path.startsWith('//');

/**
 * Where to go once signed in: the code screen while the server requires a confirmed email and this one isn't; then
 * back to `next` when it's safe, else the game (or the creator without a character). Pages outside the game
 * (moderation, payment callbacks) don't need a character.
 */
export function destinationFor(user: AuthUserDto, next: string | null): string {
  if (user.mustVerifyEmail) {
    const keep = isSafePath(next) && !next.startsWith('/verify-email');
    return keep ? `/verify-email?next=${encodeURIComponent(next)}` : '/verify-email';
  }
  const home = user.hasCharacter ? '/play' : '/create';
  if (!isSafePath(next) || next.startsWith('/verify-email')) return home;
  const needsCharacter = next === '/play' || next.startsWith('/play/') || next.startsWith('/play?');
  return needsCharacter && !user.hasCharacter ? '/create' : next;
}
