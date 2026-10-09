'use client';

import { useState } from 'react';
import { toast } from '@/common/components/toast-store';
import { useInstallPrompt, type InstallPrompt } from './use-install-prompt';

export interface InstallFlow extends InstallPrompt {
  /** Native prompt where the browser offers one, otherwise opens the manual steps. */
  readonly start: () => Promise<void>;
  readonly stepsOpen: boolean;
  readonly closeSteps: () => void;
}

/** What a "Download the app" control does when pressed. */
export function useInstallFlow(): InstallFlow {
  const install = useInstallPrompt();
  const [stepsOpen, setStepsOpen] = useState(false);
  const start = async (): Promise<void> => {
    if (install.status === 'instructions') {
      setStepsOpen(true);
      return;
    }
    if (install.status !== 'prompt') return;
    const outcome = await install.promptInstall();
    if (outcome === 'accepted') toast({ tone: 'good', title: 'Installing Inside Life', body: 'It will sit with your other apps. Same account, same life.' });
  };
  return { ...install, start, stepsOpen, closeSteps: () => setStepsOpen(false) };
}
