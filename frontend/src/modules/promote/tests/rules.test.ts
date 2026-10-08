import { describe, expect, it } from 'vitest';
import type { BillboardDayAvailability } from '@insidelife/shared';
import {
  addDays,
  checkImageFile,
  checkTrackFile,
  cropReport,
  dayState,
  daysBetween,
  firstOpenStart,
  formatDuration,
  formatRange,
  minimumImageSize,
  quoteBillboard,
  rangeAvailability,
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

describe('quoteBillboard (shared billboardQuote in naira)', () => {
  it('discounts every complete week by 15%', () => {
    const week = quoteBillboard(2_000_000, 7)!;
    expect(week).toMatchObject({ unitNaira: 20_000, subtotalNaira: 140_000, discountNaira: 21_000, totalNaira: 119_000 });
    const tenDays = quoteBillboard(250_000, 10)!;
    expect(tenDays.subtotalNaira).toBe(25_000);
    expect(tenDays.discountNaira).toBe(2_625);
    expect(quoteBillboard(250_000, 3)!.discountNaira).toBe(0);
  });

  it('returns null for lengths the server refuses', () => {
    expect(quoteBillboard(250_000, 0)).toBeNull();
    expect(quoteBillboard(250_000, 31)).toBeNull();
    expect(quoteBillboard(250_000, 2.5)).toBeNull();
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
  const day = (date: string, booked: number): BillboardDayAvailability => ({ date, booked, capacity: 4 });
  const days = [day('2026-10-08', 4), day('2026-10-09', 2), day('2026-10-10', 0), day('2026-10-11', 0)];

  it('does date maths on Lagos calendar days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-10-08', '2026-10-15')).toBe(7);
    expect(formatRange('2026-10-08', '2026-10-15')).toBe('8 Oct – 14 Oct');
    expect(formatRange('2026-10-08', '2026-10-09')).toBe('8 Oct');
  });

  it('rates each day and checks a run against the calendar', () => {
    expect(days.map(dayState)).toEqual(['full', 'filling', 'open', 'open']);
    expect(rangeAvailability(days, '2026-10-08', 2)).toEqual({ fullDays: ['2026-10-08'], unknownDays: 0 });
    expect(rangeAvailability(days, '2026-10-10', 4)).toEqual({ fullDays: [], unknownDays: 2 });
    expect(firstOpenStart(days, '2026-10-08', 2)).toBe('2026-10-09');
    expect(firstOpenStart([day('2026-10-08', 4)], '2026-10-08', 1)).toBeNull();
  });

  it('formats track length', () => {
    expect(formatDuration(35)).toBe('0:35');
    expect(formatDuration(204.6)).toBe('3:25');
  });
});
