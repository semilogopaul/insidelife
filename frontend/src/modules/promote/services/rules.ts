import {
  BILLBOARD_FORMAT_SPECS,
  BILLBOARD_MIN_UPLOAD_SCALE,
  CREATIVE_ACCEPTED_TYPES,
  CREATIVE_MAX_BYTES,
  LINK_URL_MAX,
  PROMOTION_TITLE_MAX,
  TRACK_ACCEPTED_TYPES,
  TRACK_MAX_BYTES,
  TRACK_MAX_SECONDS,
  TRACK_MIN_SECONDS,
  adQuote,
  koboToNaira,
  runLengthLabel,
  type BillboardFormat,
  type IsoDate,
  type PromotionQuote,
} from '@insidelife/shared';

/**
 * Client mirrors of the promotions rules (backend promotions/rules/*.ts). They give instant feedback while typing;
 * the server re-checks everything and stays authoritative.
 */

export type Check = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: string };

const ok = (value: string): Check => ({ ok: true, value });
const fail = (reason: string): Check => ({ ok: false, reason });

// ----- Links -----------------------------------------------------------------------------------------------------

const URL_SHORTENERS: ReadonlySet<string> = new Set([
  'bit.ly', 'bitly.com', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'v.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'rb.gy',
  'tiny.cc', 'bl.ink', 't.ly', 's.id', 'lnkd.in', 'shorte.st', 'adf.ly', 'linktr.ee', 'tr.im', 'qr.ae', 'u.to', 'clck.ru', 'short.io',
]);
const PRIVATE_SUFFIXES: readonly string[] = ['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'home.arpa', 'onion', 'test', 'invalid'];
const DOWNLOAD_PATH = /\.(apk|aab|xapk|ipa|exe|msi|bat|cmd|com|scr|dmg|pkg|jar|deb|rpm|sh|ps1|vbs|iso|zip|rar|7z)$/i;
const IPV4_HOST = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TOP_LEVEL_DOMAIN = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const UNSAFE_URL_CHARS = /[\s\u0000-\u001f\u007f-\u009f\\]/;

/** Billboard link: https only, a real public domain, no IPs, shorteners, credentials, odd ports or file downloads. */
export function validateLink(raw: string): Check {
  const input = raw.trim();
  if (input.length === 0) return fail('Add the link people should open');
  if (input.length > LINK_URL_MAX) return fail(`Links can be at most ${LINK_URL_MAX} characters`);
  if (UNSAFE_URL_CHARS.test(input)) return fail('Links can’t contain spaces or special characters');
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

// ----- Display text ----------------------------------------------------------------------------------------------

const INVISIBLE_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const LINK_IN_TEXT = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|xyz|link|ly)\b)/i;

/** Titles and artist names: 3+ characters, bounded, no links (links only go in the link field). */
export function validateDisplayText(raw: string, field: string, min: number, max: number): Check {
  const value = raw.replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim();
  if (value.length < min) return fail(`${field} needs at least ${min} characters`);
  if (value.length > max) return fail(`${field} can be at most ${max} characters`);
  if (LINK_IN_TEXT.test(value)) return fail(`${field} can’t contain a link`);
  return ok(value);
}

export const validateTitle = (raw: string): Check => validateDisplayText(raw, 'Title', 3, PROMOTION_TITLE_MAX);

// ----- Files -----------------------------------------------------------------------------------------------------

const MB = 1024 * 1024;

export function checkImageFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(CREATIVE_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return 'Upload a PNG, JPEG or WebP image.';
  if (file.size > CREATIVE_MAX_BYTES) return `Images can be at most ${CREATIVE_MAX_BYTES / MB} MB.`;
  if (file.size === 0) return 'That file is empty.';
  return null;
}

export function checkTrackFile(file: Pick<File, 'type' | 'size'>): string | null {
  const type = file.type === 'audio/mp3' ? 'audio/mpeg' : file.type;
  if (!(TRACK_ACCEPTED_TYPES as readonly string[]).includes(type)) return 'Upload an MP3 or OGG song.';
  if (file.size > TRACK_MAX_BYTES) return `Songs can be at most ${TRACK_MAX_BYTES / MB} MB.`;
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/**
 * The browser's reading of a song's length, checked against the rule (30 s to 3 minutes). The server measures
 * the file itself and has the last word.
 */
export function trackDurationProblem(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < TRACK_MIN_SECONDS) return `Songs need at least ${TRACK_MIN_SECONDS} seconds.`;
  if (seconds > TRACK_MAX_SECONDS + 0.5) return `Songs can be at most ${TRACK_MAX_SECONDS / 60} minutes. This one is ${formatDuration(Math.floor(seconds))}: trim it or use a radio edit.`;
  return null;
}

/** Smallest source image the server accepts for a format (half the target on each side). */
export function minimumImageSize(format: BillboardFormat): { readonly width: number; readonly height: number } {
  const spec = BILLBOARD_FORMAT_SPECS[format];
  return { width: Math.ceil(spec.width * BILLBOARD_MIN_UPLOAD_SCALE), height: Math.ceil(spec.height * BILLBOARD_MIN_UPLOAD_SCALE) };
}

export interface CropReport {
  /** Share of the source kept by the centre "cover" crop (1 = nothing cut). */
  readonly kept: number;
  /** Which sides lose pixels. */
  readonly trims: 'none' | 'sides' | 'top-bottom';
  readonly tooSmall: boolean;
}

/** What the server's centre cover-crop will do to an image of this size on this format. */
export function cropReport(width: number, height: number, format: BillboardFormat): CropReport {
  const spec = BILLBOARD_FORMAT_SPECS[format];
  const min = minimumImageSize(format);
  const source = width / height;
  const target = spec.width / spec.height;
  const kept = source > target ? target / source : source / target;
  const trims = Math.abs(source - target) / target < 0.01 ? 'none' : source > target ? 'sides' : 'top-bottom';
  return { kept, trims, tooSmall: width < min.width || height < min.height };
}

// ----- Dates & quotes --------------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const utc = (date: IsoDate): number => Date.parse(`${date}T00:00:00.000Z`);

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

const dayFormat = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortFormat = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "Thu 8 Oct" (real Lagos calendar day). */
export const formatDay = (date: IsoDate): string => dayFormat.format(new Date(utc(date))).replace(',', '');
export const formatShortDay = (date: IsoDate): string => shortFormat.format(new Date(utc(date)));

/** "8 Oct – 14 Oct" for an exclusive end date. */
export function formatRange(startDate: IsoDate, endDate: IsoDate): string {
  const last = addDays(endDate, -1);
  return startDate === last ? formatShortDay(startDate) : `${formatShortDay(startDate)} – ${formatShortDay(last)}`;
}

/** "Fri 9 Oct – Thu 15 Oct" for an exclusive end date (the run's first and last day). */
export function formatRunDays(startDate: IsoDate, endDate: IsoDate): string {
  return `${formatDay(startDate)} – ${formatDay(addDays(endDate, -1))}`;
}

export interface QuotePreview extends PromotionQuote {
  readonly blockNaira: number;
  readonly totalNaira: number;
}

/**
 * Shared `adQuote` in naira: `blocks` consecutive blocks of `blockDays` (7, or 3 for slots of ₦100,000 a week or more)
 * at the slot's current weekly rate, or null when it can't be sold. The server quotes the same.
 */
export function quoteBlocks(weekPriceKobo: number, blocks: number, blockDays: number): QuotePreview | null {
  try {
    const quote = adQuote(weekPriceKobo, blocks, blockDays);
    return { ...quote, blockNaira: koboToNaira(quote.blockPriceKobo), totalNaira: koboToNaira(quote.totalKobo) };
  } catch {
    return null;
  }
}

/** @deprecated `quoteBlocks(weekPriceKobo, weeks, 7)`. */
export const quoteWeeks = (weekPriceKobo: number, weeks: number): QuotePreview | null => quoteBlocks(weekPriceKobo, weeks, 7);

/** How a choice of blocks reads on its button: "1 week", "2 weeks", "3 days", "9 days". */
export const blocksLabel = (blocks: number, blockDays: number): string => runLengthLabel(blocks * blockDays);

/** "Runs Fri 9 Oct – Sun 11 Oct · 3 days" for a run starting on `start`. */
export function runSummary(start: IsoDate, days: number): string {
  return `Runs ${formatRunDays(start, addDays(start, days))} · ${runLengthLabel(days)}`;
}

/** A slot's next free day in words: "Free from today" / "Next free: Thu 15 Oct" / "Fully booked for 2 months". */
export function nextFreeLabel(nextStart: IsoDate | null | undefined, today: IsoDate): string {
  if (!nextStart) return 'Fully booked for 2 months';
  return nextStart <= today ? 'Free from today' : `Next free: ${formatDay(nextStart)}`;
}

/** "3:24" from seconds. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
