'use client';

import { Share, SquarePlus, type LucideIcon } from 'lucide-react';
import { AppMark, Button, Sheet } from '@/common/components';
import type { InstallPlatform } from './platform';

interface Step {
  readonly title: string;
  readonly hint: string;
  /** What the player looks for on screen; null shows the app icon they end up with. */
  readonly icon: LucideIcon | null;
}

const IOS_STEPS = (where: string): readonly Step[] => [
  { title: 'Tap Share', hint: `The square with an arrow ${where}. On iOS 26, tap ••• first.`, icon: Share },
  { title: 'Choose Add to Home Screen', hint: 'Scroll down the list if you don’t see it.', icon: SquarePlus },
  { title: 'Tap Add', hint: 'Inside Life lands on your home screen and opens full screen, like any game.', icon: null },
];

const MAC_STEPS: readonly Step[] = [
  { title: 'Click Share', hint: 'In Safari’s toolbar, or open the File menu.', icon: Share },
  { title: 'Choose Add to Dock', hint: 'Safari makes Inside Life its own app.', icon: SquarePlus },
  { title: 'Click Add', hint: 'Open it from the Dock or Launchpad, with no browser bars.', icon: null },
];

function stepsFor(platform: InstallPlatform): readonly Step[] {
  if (platform === 'mac') return MAC_STEPS;
  return IOS_STEPS(platform === 'ipados' ? 'at the top of Safari' : 'in Safari’s toolbar');
}

export interface InstallStepsProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly platform: InstallPlatform;
}

/** Manual install guide for browsers without an install prompt (Safari on iPhone, iPad and Mac). */
export function InstallSteps({ open, onClose, platform }: InstallStepsProps) {
  const steps = stepsFor(platform);
  const device = platform === 'mac' ? 'Mac' : platform === 'ipados' ? 'iPad' : 'iPhone';
  return (
    <Sheet open={open} onClose={onClose} title={`Add Inside Life to your ${device}`} description="Three taps, no app store. It’s free and updates itself.">
      <ol className="flex flex-col gap-3 pt-1">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="grid grid-cols-[4.5rem_1fr] items-center gap-4">
              <div className="relative grid size-[4.5rem] place-items-center rounded-card bg-paper-2 ring-1 ring-line">
                {Icon ? <Icon size={30} strokeWidth={2.2} aria-hidden className="text-cobalt" /> : <AppMark size={44} decorative />}
                <span aria-hidden className="absolute -left-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-ink text-xs font-bold text-on-ink">
                  {index + 1}
                </span>
              </div>
              <div>
                <p className="font-bold">{step.title}</p>
                <p className="text-sm text-text-soft">{step.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <Button variant="ink" block className="mt-5" onClick={onClose}>
        Got it
      </Button>
    </Sheet>
  );
}
