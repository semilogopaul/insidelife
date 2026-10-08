import { LINK_URL_MAX } from '@insidelife/shared';

/**
 * Pure checks for what buyers type: billboard links and display text. The server never fetches these links (no SSRF
 * surface); the checks protect players who tap them and keep shorteners/downloads/raw IPs out of the city.
 */

export type CheckResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: string };

const ok = (value: string): CheckResult => ({ ok: true, value });
const fail = (reason: string): CheckResult => ({ ok: false, reason });

/** Well-known redirectors: they hide the destination from players and moderators. */
const URL_SHORTENERS: ReadonlySet<string> = new Set([
  'bit.ly',
  'bitly.com',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'v.gd',
  'buff.ly',
  'cutt.ly',
  'rebrand.ly',
  'shorturl.at',
  'rb.gy',
  'tiny.cc',
  'bl.ink',
  't.ly',
  's.id',
  'lnkd.in',
  'shorte.st',
  'adf.ly',
  'linktr.ee',
  'tr.im',
  'qr.ae',
  'u.to',
  'clck.ru',
  'short.io',
]);

/** Hostnames that never resolve on the public internet (or resolve to the viewer's own machine/network). */
const PRIVATE_SUFFIXES: readonly string[] = ['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'home.arpa', 'onion', 'test', 'invalid'];

/** Direct app/file downloads are a malware vector; promote a web page instead. */
const DOWNLOAD_PATH = /\.(apk|aab|xapk|ipa|exe|msi|bat|cmd|com|scr|dmg|pkg|jar|deb|rpm|sh|ps1|vbs|iso|zip|rar|7z)$/i;

const IPV4_HOST = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TOP_LEVEL_DOMAIN = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
/** Whitespace, C0/C1 controls and backslashes (browsers treat `\` as `/`, a classic confusion trick). */
// oxlint-disable-next-line no-control-regex -- matching control characters is the point of this check
const UNSAFE_URL_CHARS = /[\s\u0000-\u001f\u007f-\u009f\\]/;

/** Validate and normalise a billboard link. Returns the canonical `href` to store. */
export function validatePromotionLink(raw: string): CheckResult {
  const input = raw.trim();
  if (input.length === 0) return fail('Add the link people should open');
  if (input.length > LINK_URL_MAX) return fail(`Links can be at most ${LINK_URL_MAX} characters`);
  if (UNSAFE_URL_CHARS.test(input)) return fail('Links can’t contain spaces or special characters');
  // Checked on the raw text so javascript:, data:, http:, protocol-relative and other schemes never get further.
  if (!/^https:\/\//i.test(input)) return fail('Links must start with https://');

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail('That link doesn’t look right');
  }
  if (url.protocol !== 'https:') return fail('Links must start with https://');
  if (url.username !== '' || url.password !== '') return fail('Links can’t contain a username or password');
  if (url.port !== '' && url.port !== '443') return fail('Links can’t use a custom port');

  // WHATWG URL already normalised IPv4 tricks (0x7f.1, 2130706433…) to dotted quads and IDNs to punycode.
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || IPV4_HOST.test(host)) return fail('Use a website address, not an IP address');
  const labels = host.split('.');
  if (labels.length < 2) return fail('Use a full website address, like https://yourbrand.ng');
  if (!labels.every((label) => HOST_LABEL.test(label))) return fail('That website address doesn’t look right');
  if (!TOP_LEVEL_DOMAIN.test(labels[labels.length - 1] ?? '')) return fail('That website address doesn’t look right');
  if (PRIVATE_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return fail('That address isn’t on the public internet');

  const bareHost = host.startsWith('www.') ? host.slice(4) : host;
  if (URL_SHORTENERS.has(bareHost)) return fail('Link shorteners aren’t allowed — use the full address');
  if (DOWNLOAD_PATH.test(url.pathname)) return fail('Links can’t point straight to an app or file download');

  return ok(url.href);
}

/** Zero-width, bidi-override and control characters: invisible tricks in names shown to every player. */
// oxlint-disable-next-line no-control-regex -- stripping control characters is the point of this pattern
const INVISIBLE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
const LINK_IN_TEXT = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|xyz|link|ly)\b)/i;

export function cleanDisplayText(raw: string): string {
  return raw.replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim();
}

/** Titles and artist names: cleaned, bounded, and free of links (links only go in the link field). */
export function validateDisplayText(raw: string, field: string, min: number, max: number): CheckResult {
  const value = cleanDisplayText(raw);
  if (value.length < min) return fail(`${field} needs at least ${min} characters`);
  if (value.length > max) return fail(`${field} can be at most ${max} characters`);
  if (LINK_IN_TEXT.test(value)) return fail(`${field} can’t contain a link`);
  return ok(value);
}
