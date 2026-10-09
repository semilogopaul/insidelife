import { afterEach, describe, expect, it, vi } from 'vitest';
import { promptInstall, useInstallStore } from '../install-store';

/** A stand-in for Chromium's `beforeinstallprompt` (jsdom has none). */
function installPromptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { platforms: ['web'], prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
  return { event, prompt };
}

afterEach(() => useInstallStore.setState({ promptEvent: null, installed: false }));

describe('install store', () => {
  it('captures the deferred prompt on module load and silences the browser infobar', () => {
    const { event } = installPromptEvent('accepted');
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(useInstallStore.getState().promptEvent).toBe(event);
  });

  it('shows the prompt once and records an accepted install', async () => {
    const { event, prompt } = installPromptEvent('accepted');
    window.dispatchEvent(event);
    await expect(promptInstall()).resolves.toBe('accepted');
    expect(prompt).toHaveBeenCalledOnce();
    expect(useInstallStore.getState()).toMatchObject({ promptEvent: null, installed: true });
    await expect(promptInstall()).resolves.toBe('unavailable');
  });

  it('forgets a dismissed prompt without marking the app installed', async () => {
    window.dispatchEvent(installPromptEvent('dismissed').event);
    await expect(promptInstall()).resolves.toBe('dismissed');
    expect(useInstallStore.getState()).toMatchObject({ promptEvent: null, installed: false });
  });

  it('marks the app installed on appinstalled and ignores look-alike events', () => {
    window.dispatchEvent(new Event('beforeinstallprompt'));
    expect(useInstallStore.getState().promptEvent).toBeNull();
    window.dispatchEvent(new Event('appinstalled'));
    expect(useInstallStore.getState().installed).toBe(true);
  });
});
