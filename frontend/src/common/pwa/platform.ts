/** Where the game would be installed: drives the button label and the manual install steps. */
export type InstallPlatform = 'android' | 'ios' | 'ipados' | 'windows' | 'mac' | 'chromeos' | 'linux' | 'other';
export type InstallBrowser = 'safari' | 'chromium' | 'firefox' | 'other';

export interface DeviceInfo {
  readonly platform: InstallPlatform;
  readonly browser: InstallBrowser;
  /** Safari major version (0 when not Safari or unknown). macOS Safari adds web apps to the Dock from 17. */
  readonly safariVersion: number;
}

export interface DeviceHints {
  readonly userAgent: string;
  /** iPadOS reports a Mac user agent; touch points tell them apart. */
  readonly maxTouchPoints: number;
}

const CHROMIUM = /Chrome|Chromium|CriOS|EdgiOS|Edg\/|OPR\/|SamsungBrowser/;

export function detectDevice({ userAgent: ua, maxTouchPoints }: DeviceHints): DeviceInfo {
  const platform: InstallPlatform = /iPhone|iPod/.test(ua)
    ? 'ios'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
      ? 'ipados'
      : /Android/.test(ua)
        ? 'android'
        : /CrOS/.test(ua)
          ? 'chromeos'
          : /Windows/.test(ua)
            ? 'windows'
            : /Macintosh|Mac OS X/.test(ua)
              ? 'mac'
              : /Linux/.test(ua)
                ? 'linux'
                : 'other';
  const browser: InstallBrowser = /Firefox|FxiOS/.test(ua)
    ? 'firefox'
    : CHROMIUM.test(ua)
      ? 'chromium'
      : /Safari\//.test(ua) && /Version\//.test(ua)
        ? 'safari'
        : 'other';
  const safariVersion = browser === 'safari' ? Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0) : 0;
  return { platform, browser, safariVersion };
}

/**
 * Browsers without an install prompt API where the player can still install by hand: every iOS/iPadOS browser
 * (Share → Add to Home Screen) and Safari 17+ on macOS (Add to Dock).
 */
export function hasManualInstall(device: DeviceInfo): boolean {
  if (device.platform === 'ios' || device.platform === 'ipados') return true;
  return device.platform === 'mac' && device.browser === 'safari' && device.safariVersion >= 17;
}

const PLATFORM_NAME: Readonly<Record<InstallPlatform, string | null>> = {
  android: 'Android',
  ios: 'iPhone',
  ipados: 'iPad',
  windows: 'Windows',
  mac: 'Mac',
  chromeos: 'Chromebook',
  linux: 'Linux',
  other: null,
};

/** "Download for Android", or a neutral label when the platform is unknown. */
export function downloadLabel(platform: InstallPlatform): string {
  const name = PLATFORM_NAME[platform];
  return name ? `Download for ${name}` : 'Download the app';
}
