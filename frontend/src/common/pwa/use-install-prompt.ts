'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useMediaQuery } from '@/common/hooks/use-media-query';
import { promptInstall, useInstallStore, type InstallOutcome } from './install-store';
import { detectDevice, downloadLabel, hasManualInstall, type DeviceInfo } from './platform';

/**
 * - `installed`: running as the installed app, or installed during this visit; hide every install affordance.
 * - `prompt`: the browser handed us its native install prompt (Chrome, Edge, Samsung Internet).
 * - `instructions`: no prompt API, but the player can install by hand (iOS/iPadOS, Safari on macOS).
 * - `unavailable`: neither (Firefox desktop, before Chrome offers the prompt, or during server render).
 */
export type InstallStatus = 'installed' | 'prompt' | 'instructions' | 'unavailable';

export interface InstallPrompt {
  readonly status: InstallStatus;
  /** Null during server render and hydration. */
  readonly device: DeviceInfo | null;
  /** "Download for Android", "Download for iPhone"… */
  readonly label: string;
  readonly promptInstall: () => Promise<InstallOutcome>;
}

/** Every display mode an installed web app can launch in (the manifest prefers fullscreen, then standalone). */
const INSTALLED_DISPLAY = '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)';

interface ClientInfo {
  readonly device: DeviceInfo;
  /** iOS home-screen apps also expose the legacy `navigator.standalone`. */
  readonly iosStandalone: boolean;
}

let clientInfo: ClientInfo | null = null;
const readClientInfo = (): ClientInfo =>
  (clientInfo ??= {
    device: detectDevice({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }),
    iosStandalone: (navigator as Navigator & { readonly standalone?: boolean }).standalone === true,
  });
const subscribeNever = (): (() => void) => () => {};

/** Install state for the "Download the app" affordances (landing page, Me → Settings). */
export function useInstallPrompt(): InstallPrompt {
  const promptEvent = useInstallStore((state) => state.promptEvent);
  const installedThisVisit = useInstallStore((state) => state.installed);
  const displayInstalled = useMediaQuery(INSTALLED_DISPLAY);
  const client = useSyncExternalStore(subscribeNever, readClientInfo, () => null);
  const prompt = useCallback(() => promptInstall(), []);

  const status: InstallStatus =
    installedThisVisit || displayInstalled || client?.iosStandalone
      ? 'installed'
      : promptEvent
        ? 'prompt'
        : client && hasManualInstall(client.device)
          ? 'instructions'
          : 'unavailable';
  return { status, device: client?.device ?? null, label: downloadLabel(client?.device.platform ?? 'other'), promptInstall: prompt };
}
