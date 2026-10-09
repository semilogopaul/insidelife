'use client';

import { AppMark } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { InstallSteps } from './InstallSteps';
import { useInstallFlow } from './use-install-flow';

/**
 * "Download for Android / iPhone / Mac…" on dark surfaces (the landing page). Shows the browser's install prompt, or
 * the manual steps on Safari; renders nothing when the game is already installed or the browser can't install it.
 */
export function InstallAppButton({ className }: { readonly className?: string }) {
  const flow = useInstallFlow();
  if (flow.status !== 'prompt' && flow.status !== 'instructions') return null;
  return (
    <>
      <button
        type="button"
        onClick={() => void flow.start()}
        className={cn(
          'inline-flex min-h-14 items-center gap-3 rounded-card bg-ink/70 py-1.5 pl-1.5 pr-5 text-left ring-1 ring-white/20 backdrop-blur-md hover:bg-ink/85 hover:ring-white/40',
          className,
        )}
      >
        <AppMark size={44} decorative />
        <span className="flex flex-col">
          <span className="text-lg font-bold leading-tight">{flow.label}</span>
          <span className="text-sm text-on-ink-soft">Free, no app store. Opens full screen.</span>
        </span>
      </button>
      {flow.device && <InstallSteps open={flow.stepsOpen} onClose={flow.closeSteps} platform={flow.device.platform} />}
    </>
  );
}
