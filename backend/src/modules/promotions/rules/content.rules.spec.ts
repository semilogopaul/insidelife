import { cleanDisplayText, validateDisplayText, validatePromotionLink } from './content.rules.js';

const accepted = (raw: string): string => {
  const result = validatePromotionLink(raw);
  if (!result.ok) throw new RangeError(`expected ${raw} to be accepted, got: ${result.reason}`);
  return result.value;
};
const rejected = (raw: string): string => {
  const result = validatePromotionLink(raw);
  if (result.ok) throw new RangeError(`expected ${raw} to be rejected`);
  return result.reason;
};

describe('validatePromotionLink', () => {
  it('accepts ordinary https links and normalises them', () => {
    expect(accepted('https://shoprite.ng')).toBe('https://shoprite.ng/');
    expect(accepted('  https://www.Jumia.com.ng/phones?ref=insidelife#deals ')).toBe('https://www.jumia.com.ng/phones?ref=insidelife#deals');
    expect(accepted('https://instagram.com/burnaboygram')).toBe('https://instagram.com/burnaboygram');
    expect(accepted('https://example.com:443/x')).toBe('https://example.com/x');
    expect(accepted('https://ẹ̀kọ́.ng/')).toMatch(/^https:\/\/xn--/);
  });

  it('only allows https', () => {
    for (const raw of ['http://shoprite.ng', 'javascript:alert(1)', 'JAVASCRIPT:alert(document.cookie)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox', 'file:///etc/passwd', '//shoprite.ng', 'ftp://shoprite.ng', 'shoprite.ng']) {
      expect(rejected(raw)).toBe('Links must start with https://');
    }
  });

  it('refuses IP addresses in every notation, and private hostnames', () => {
    for (const raw of ['https://127.0.0.1/', 'https://10.0.0.5/admin', 'https://2130706433/', 'https://0x7f.0.0.1/', 'https://127.1/', 'https://[::1]/', 'https://[fd00::1]/']) {
      expect(rejected(raw)).toBe('Use a website address, not an IP address');
    }
    expect(rejected('https://localhost/')).toMatch(/full website address/);
    for (const raw of ['https://api.localhost/', 'https://printer.local/', 'https://db.internal/', 'https://router.home.arpa/', 'https://abc.onion/']) {
      expect(rejected(raw)).toBe('That address isn’t on the public internet');
    }
  });

  it('refuses credentials, custom ports, whitespace, control characters and backslashes', () => {
    expect(rejected('https://user:pass@shoprite.ng/')).toMatch(/username or password/);
    expect(rejected('https://shoprite.ng@evil.com/')).toMatch(/username or password/);
    expect(rejected('https://shoprite.ng:8443/')).toMatch(/custom port/);
    expect(rejected('https://shop rite.ng/')).toMatch(/spaces or special characters/);
    expect(rejected('https://shoprite.ng/\u0000')).toMatch(/spaces or special characters/);
    expect(rejected('https://evil.com\\@shoprite.ng')).toMatch(/spaces or special characters/);
  });

  it('refuses shorteners, downloads and malformed hosts', () => {
    expect(rejected('https://bit.ly/3abc')).toMatch(/shorteners/);
    expect(rejected('https://www.tinyurl.com/x')).toMatch(/shorteners/);
    expect(rejected('https://example.com/app-release.APK')).toMatch(/download/);
    expect(rejected('https://example.com/setup.exe')).toMatch(/download/);
    expect(rejected('https://-bad-.com/')).toMatch(/doesn’t look right/);
    expect(rejected('https://example.123/')).toMatch(/doesn’t look right/);
    expect(rejected('')).toMatch(/Add the link/);
    expect(rejected(`https://example.com/${'a'.repeat(600)}`)).toMatch(/at most/);
  });
});

describe('display text', () => {
  it('strips invisible characters and collapses whitespace', () => {
    expect(cleanDisplayText('  Burna\u200b  Boy\u202e \n ')).toBe('Burna Boy');
  });

  it('bounds length and refuses links in names', () => {
    expect(validateDisplayText('Odogwu', 'Artist name', 2, 40)).toEqual({ ok: true, value: 'Odogwu' });
    expect(validateDisplayText(' x ', 'Artist name', 2, 40).ok).toBe(false);
    expect(validateDisplayText('a'.repeat(41), 'Artist name', 2, 40).ok).toBe(false);
    expect(validateDisplayText('Stream now on www.mysite.ng', 'Song title', 1, 60).ok).toBe(false);
    expect(validateDisplayText('Buy at shop.com', 'Title', 3, 60).ok).toBe(false);
    expect(validateDisplayText('Ojuelegba (Remix) ft. Drake', 'Song title', 1, 60).ok).toBe(true);
  });
});
