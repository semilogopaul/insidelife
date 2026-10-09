import { create } from 'zustand';

/** Chromium's deferred install prompt (Chrome, Edge, Samsung Internet); not part of lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed'; readonly platform: string }>;
  prompt(): Promise<void>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface InstallState {
  /** The saved `beforeinstallprompt`. Each event can show the native prompt once. */
  readonly promptEvent: BeforeInstallPromptEvent | null;
  /** `appinstalled` fired (or the player accepted the prompt) during this visit. */
  readonly installed: boolean;
}

export const useInstallStore = create<InstallState>()(() => ({ promptEvent: null, installed: false }));

const isInstallPromptEvent = (event: Event): event is BeforeInstallPromptEvent =>
  typeof (event as Partial<BeforeInstallPromptEvent>).prompt === 'function';

/** Captures the browser's install events on `target`. Returns a function that stops listening. */
export function captureInstallEvents(target: Window): () => void {
  const onPrompt = (event: Event): void => {
    if (!isInstallPromptEvent(event)) return;
    // Our "Download" button shows the prompt; keep Chrome's own mini-infobar from popping up mid-game.
    event.preventDefault();
    useInstallStore.setState({ promptEvent: event });
  };
  const onInstalled = (): void => useInstallStore.setState({ promptEvent: null, installed: true });
  target.addEventListener('beforeinstallprompt', onPrompt);
  target.addEventListener('appinstalled', onInstalled);
  return () => {
    target.removeEventListener('beforeinstallprompt', onPrompt);
    target.removeEventListener('appinstalled', onInstalled);
  };
}

/** Shows the native install prompt if the browser offered one. */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = useInstallStore.getState().promptEvent;
  if (!event) return 'unavailable';
  useInstallStore.setState({ promptEvent: null });
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') useInstallStore.setState({ installed: true });
  return outcome;
}

// Chrome can fire `beforeinstallprompt` before React hydrates, so capture starts when this module first loads
// (the root providers import it) rather than in an effect.
if (typeof window !== 'undefined') captureInstallEvents(window);
