import { describe, expect, it } from 'vitest';
import {
  addDays,
  checkImageFile,
  checkTrackFile,
  cropReport,
  daysBetween,
  formatDuration,
  formatRange,
  formatRunDays,
  minimumImageSize,
  nextFreeLabel,
  quoteWeeks,
  trackDurationProblem,
  validateDisplayText,
  validateLink,
  validateTitle,
} from '../services/rules';

const accepted = (raw: string): string => {
  const result = validateLink(raw);
  if (!result.ok) throw new RangeError(`expected ${raw} to be accepted, got: ${result.reason}`);
  return result.value;
};
const rejected = (raw: string): string => {
  const result = validateLink(raw);
  if (result.ok) throw new RangeError(`expected ${raw} to be rejected`);
  return result.reason;
};

/** Same cases as backend promotions/rules/content.rules.spec.ts, so the mirror can't drift silently. */
describe('validateLink (mirror of the server rule)', () => {
  it('accepts ordinary https links and normalises them', () => {
    expect(accepted('https://shoprite.ng')).toBe('https://shoprite.ng/');
    expect(accepted('  https://www.Jumia.com.ng/phones?ref=insidelife#deals ')).toBe('https://www.jumia.com.ng/phones?ref=insidelife#deals');
    expect(accepted('https://example.com:443/x')).toBe('https://example.com/x');
  });

  it('only allows https', () => {
    for (const raw of ['http://shoprite.ng', 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', '//shoprite.ng', 'shoprite.ng']) {
      expect(rejected(raw)).toBe('Links must start with https://');
    }
  });

  it('refuses IPs, private hosts, credentials, ports and odd characters', () => {
    for (const raw of ['https://127.0.0.1/', 'https://2130706433/', 'https://0x7f.0.0.1/', 'https://[::1]/']) {
      expect(rejected(raw)).toBe('Use a website address, not an IP address');
    }
    expect(rejected('https://localhost/')).toMatch(/full website address/);
    expect(rejected('https://printer.local/')).toBe('That address isn’t on the public internet');
    expect(rejected('https://shoprite.ng@evil.com/')).toMatch(/username or password/);
    expect(rejected('https://shoprite.ng:8443/')).toMatch(/custom port/);
    expect(rejected('https://shop rite.ng/')).toMatch(/spaces or special characters/);
    expect(rejected('https://evil.com\\@shoprite.ng')).toMatch(/spaces or special characters/);
  });

  it('refuses shorteners, downloads and malformed hosts', () => {
    expect(rejected('https://bit.ly/3abc')).toMatch(/shorteners/);
    expect(rejected('https://www.tinyurl.com/x')).toMatch(/shorteners/);
    expect(rejected('https://example.com/app-release.APK')).toMatch(/download/);
    expect(rejected('https://-bad-.com/')).toMatch(/doesn’t look right/);
    expect(rejected('https://example.123/')).toMatch(/doesn’t look right/);
    expect(rejected('')).toMatch(/Add the link/);
    expect(rejected(`https://example.com/${'a'.repeat(600)}`)).toMatch(/at most/);
  });
});

describe('display text', () => {
  it('cleans, bounds and refuses links', () => {
    expect(validateDisplayText('  Burna​  Boy ', 'Artist name', 2, 40)).toEqual({ ok: true, value: 'Burna Boy' });
    expect(validateTitle('ab').ok).toBe(false);
    expect(validateTitle('Buy at shop.com').ok).toBe(false);
    expect(validateTitle('Mama Put Jollof — now in Yaba').ok).toBe(true);
  });
});

describe('quoteWeeks (shared adQuote in naira)', () => {
  it('charges whole consecutive weeks at the weekly price, no discount', () => {
    expect(quoteWeeks(17_500_000, 1)).toMatchObject({ weeks: 1, days: 7, weekNaira: 175_000, totalNaira: 175_000 });
    expect(quoteWeeks(17_500_000, 4)).toMatchObject({ days: 28, totalNaira: 700_000 });
    expect(quoteWeeks(10_000_000, 2)?.totalNaira).toBe(200_000);
  });

  it('returns null for lengths the server refuses and prices under ₦2,000', () => {
    expect(quoteWeeks(350_000, 0)).toBeNull();
    expect(quoteWeeks(350_000, 5)).toBeNull();
    expect(quoteWeeks(350_000, 1.5)).toBeNull();
    expect(quoteWeeks(150_000, 1)).toBeNull();
  });
});

describe('song length (up to 3 minutes)', () => {
  it('accepts 30 seconds to 3 minutes, as the server does', () => {
    expect(trackDurationProblem(null)).toBeNull();
    expect(trackDurationProblem(30)).toBeNull();
    expect(trackDurationProblem(180)).toBeNull();
    expect(trackDurationProblem(179.4)).toBeNull();
    expect(trackDurationProblem(29)).toMatch(/at least 30 seconds/);
    expect(trackDurationProblem(181)).toMatch(/at most 3 minutes\. This one is 3:01/);
    expect(trackDurationProblem(372)).toMatch(/This one is 6:12/);
  });
});

describe('images', () => {
  it('knows the smallest accepted upload per format', () => {
    expect(minimumImageSize('landscape')).toEqual({ width: 750, height: 250 });
    expect(minimumImageSize('portrait')).toEqual({ width: 500, height: 750 });
  });

  it('describes the centre cover crop', () => {
    expect(cropReport(1500, 500, 'landscape')).toMatchObject({ trims: 'none', kept: 1, tooSmall: false });
    const wide = cropReport(1600, 900, 'landscape');
    expect(wide.trims).toBe('top-bottom');
    expect(wide.kept).toBeCloseTo(0.593, 2);
    expect(cropReport(1000, 1000, 'portrait').trims).toBe('sides');
    expect(cropReport(300, 100, 'landscape').tooSmall).toBe(true);
  });

  it('checks file type and size before uploading', () => {
    expect(checkImageFile({ type: 'image/png', size: 1_000 })).toBeNull();
    expect(checkImageFile({ type: 'image/gif', size: 1_000 })).toMatch(/PNG, JPEG or WebP/);
    expect(checkImageFile({ type: 'image/png', size: 5 * 1024 * 1024 })).toMatch(/4 MB/);
    expect(checkTrackFile({ type: 'audio/mpeg', size: 1_000 })).toBeNull();
    expect(checkTrackFile({ type: 'audio/mp3', size: 1_000 })).toBeNull();
    expect(checkTrackFile({ type: 'audio/wav', size: 1_000 })).toMatch(/MP3 or OGG/);
  });
});

describe('calendar', () => {
  it('does date maths on Lagos calendar days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-10-08', '2026-10-15')).toBe(7);
    expect(formatRange('2026-10-08', '2026-10-15')).toBe('8 Oct – 14 Oct');
    expect(formatRange('2026-10-08', '2026-10-09')).toBe('8 Oct');
  });

  it('shows the exact days of a run and when a slot is next free, in weeks', () => {
    expect(formatRunDays('2026-10-09', '2026-10-16')).toBe('Fri 9 Oct – Thu 15 Oct');
    expect(nextFreeLabel('2026-10-09', '2026-10-09')).toBe('Free from today');
    expect(nextFreeLabel('2026-10-15', '2026-10-09')).toBe('Next free: Thu 15 Oct');
    expect(nextFreeLabel(null, '2026-10-09')).toBe('Fully booked for 2 months');
  });

  it('formats track length', () => {
    expect(formatDuration(35)).toBe('0:35');
    expect(formatDuration(204.6)).toBe('3:25');
  });
});
