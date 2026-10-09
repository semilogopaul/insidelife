'use client';

import { CircleCheck, Download } from 'lucide-react';
import { AppMark, Button } from '@/common/components';
import { InstallSteps } from './InstallSteps';
import { useInstallFlow } from './use-install-flow';
import type { InstallStatus } from './use-install-prompt';

const COPY: Readonly<Record<InstallStatus, { readonly title: string; readonly body: string }>> = {
  installed: { title: 'Installed on this device', body: 'Open Inside Life from your home screen or app list: full screen, no browser bars.' },
  prompt: { title: 'Get the app', body: 'Full screen, no browser bars, one tap from your home screen. Same account, same life.' },
  instructions: { title: 'Get the app', body: 'Full screen, no browser bars, one tap from your home screen. Same account, same life.' },
  unavailable: { title: 'Get the app', body: 'This browser has no install button here. Open its menu and look for Install app or Add to Home screen.' },
};

/** Install status and action for paper surfaces (Me → Settings). */
export function InstallAppPanel() {
  const flow = useInstallFlow();
  const copy = COPY[flow.status];
  const canInstall = flow.status === 'prompt' || flow.status === 'instructions';
  return (
    <div className="flex items-start gap-3 rounded-card bg-paper-2 p-3">
      <AppMark size={48} decorative />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-bold">
          {flow.status === 'installed' && <CircleCheck size={18} aria-hidden className="text-naira" />}
          {copy.title}
        </p>
        <p className="mt-0.5 text-sm text-text-soft">{copy.body}</p>
        {canInstall && (
          <Button size="sm" className="mt-2.5" icon={<Download size={16} aria-hidden />} onClick={() => void flow.start()}>
            {flow.label}
          </Button>
        )}
      </div>
      {flow.device && <InstallSteps open={flow.stepsOpen} onClose={flow.closeSteps} platform={flow.device.platform} />}
    </div>
  );
}
