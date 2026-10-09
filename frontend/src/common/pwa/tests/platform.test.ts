import { describe, expect, it } from 'vitest';
import { detectDevice, downloadLabel, hasManualInstall } from '../platform';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macSafari16: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
} as const;

describe('install platform', () => {
  it('detects platform and browser from the user agent', () => {
    expect(detectDevice({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toEqual({ platform: 'ios', browser: 'safari', safariVersion: 18 });
    expect(detectDevice({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toMatchObject({ platform: 'ios', browser: 'chromium' });
    expect(detectDevice({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 5 })).toMatchObject({ platform: 'ipados', browser: 'safari' });
    expect(detectDevice({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 0 })).toMatchObject({ platform: 'mac', browser: 'safari' });
    expect(detectDevice({ userAgent: UA.macChrome, maxTouchPoints: 0 })).toEqual({ platform: 'mac', browser: 'chromium', safariVersion: 0 });
    expect(detectDevice({ userAgent: UA.androidChrome, maxTouchPoints: 5 })).toMatchObject({ platform: 'android', browser: 'chromium' });
    expect(detectDevice({ userAgent: UA.windowsEdge, maxTouchPoints: 0 })).toMatchObject({ platform: 'windows', browser: 'chromium' });
    expect(detectDevice({ userAgent: UA.windowsFirefox, maxTouchPoints: 0 })).toMatchObject({ platform: 'windows', browser: 'firefox' });
    expect(detectDevice({ userAgent: UA.chromebook, maxTouchPoints: 0 })).toMatchObject({ platform: 'chromeos', browser: 'chromium' });
  });

  it('offers manual steps on every iOS browser and on Safari 17+ for Mac only', () => {
    const manual = (userAgent: string, maxTouchPoints = 0): boolean => hasManualInstall(detectDevice({ userAgent, maxTouchPoints }));
    expect(manual(UA.iphoneSafari, 5)).toBe(true);
    expect(manual(UA.iphoneChrome, 5)).toBe(true);
    expect(manual(UA.ipadDesktopMode, 5)).toBe(true);
    expect(manual(UA.ipadDesktopMode)).toBe(true);
    expect(manual(UA.macSafari16)).toBe(false);
    expect(manual(UA.macChrome)).toBe(false);
    expect(manual(UA.androidChrome, 5)).toBe(false);
    expect(manual(UA.windowsFirefox)).toBe(false);
  });

  it('labels the download for the platform', () => {
    expect(downloadLabel('android')).toBe('Download for Android');
    expect(downloadLabel('ios')).toBe('Download for iPhone');
    expect(downloadLabel('ipados')).toBe('Download for iPad');
    expect(downloadLabel('chromeos')).toBe('Download for Chromebook');
    expect(downloadLabel('other')).toBe('Download the app');
  });
});
