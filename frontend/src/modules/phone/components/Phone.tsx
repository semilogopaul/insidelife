'use client';

import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, X } from 'lucide-react';
import { formatClock12 } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { useEscapeLayer } from '@/common/hooks/use-escape-layer';
import type { PhoneAppDefinition } from '@/common/game/phone-apps';
import { useUi } from '@/common/game/ui-store';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useState } from 'react';
import type { LivePhoneAppDto } from '@insidelife/shared';
import { SponsoredAppPage, SponsoredShelf } from './SponsoredApps';

export interface PhoneProps {
  /** Supplied by the composition root. */
  readonly apps: readonly PhoneAppDefinition[];
}

/** The in-game phone: the main menu, styled as a bright handset sliding up over the world. */
export function Phone({ apps }: PhoneProps) {
  const { phoneOpen, phoneApp, openPhone, closePhone } = useUi();
  const app = apps.find((candidate) => candidate.id === phoneApp);
  const [openSponsored, setSponsored] = useState<LivePhoneAppDto | null>(null);
  // A sponsored page belongs to the home screen: it only shows while home is.
  const sponsored = phoneOpen && phoneApp === 'home' ? openSponsored : null;

  useEscapeLayer(phoneOpen, closePhone);

  return (
    <AnimatePresence>
      {phoneOpen && (
        <motion.div
          key="phone"
          role="dialog"
          aria-modal="true"
          aria-label="Phone"
          initial={{ y: '105%' }}
          animate={{ y: 0 }}
          exit={{ y: '105%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          className="absolute inset-x-0 bottom-0 z-40 mx-auto flex h-[min(92dvh,820px)] w-full max-w-[440px] flex-col overflow-hidden rounded-t-phone bg-paper text-text shadow-[0_-12px_40px_rgb(4_18_24/0.45)] sm:bottom-4 sm:rounded-phone"
        >
          <div className="flex items-center justify-between px-6 pb-1 pt-3 text-xs font-bold text-text-soft">
            <StatusClock />
            <span aria-hidden className="h-1.5 w-16 rounded-full bg-paper-3" />
            <span>9mobile 4G</span>
          </div>
          <header className="flex items-center gap-2 px-4 py-2">
            {phoneApp !== 'home' || sponsored ? (
              <button
                type="button"
                onClick={() => (sponsored ? setSponsored(null) : openPhone('home'))}
                aria-label="Back to home screen"
                className="grid size-10 place-items-center rounded-full hover:bg-paper-2"
              >
                <ChevronLeft size={22} aria-hidden />
              </button>
            ) : (
              <span className="size-10" />
            )}
            <h2 className="type-title flex-1 truncate text-xl">
              {sponsored ? sponsored.name : (app?.name ?? 'Home')}
            </h2>
            <button
              type="button"
              onClick={() => {
                gameEvents.emit('sfx', { id: 'ui-close' });
                setSponsored(null);
                closePhone();
              }}
              aria-label="Close phone"
              className="grid size-10 place-items-center rounded-full hover:bg-paper-2"
            >
              <X size={20} aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            {sponsored ? (
              <SponsoredAppPage app={sponsored} />
            ) : phoneApp === 'home' || !app ? (
              <>
                <ul className="grid grid-cols-4 gap-x-3 gap-y-5 pt-2">
                  {apps.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            gameEvents.emit('sfx', { id: 'ui-click' });
                            openPhone(item.id);
                          }}
                          className="flex w-full flex-col items-center gap-1.5"
                        >
                          <span
                            className="grid size-14 place-items-center rounded-[18px] text-white shadow-[var(--shadow-lift)]"
                            style={{ background: item.tint }}
                          >
                            <Icon
                              size={26}
                              aria-hidden
                              strokeWidth={2.2}
                              color={item.tint === '#f6b90b' ? '#0e2733' : 'white'}
                            />
                          </span>
                          <span className="text-xs font-bold">{item.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <SponsoredShelf onOpen={setSponsored} />
              </>
            ) : (
              <app.component />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Ticks every second like the HUD clock; its own component so the open app doesn't re-render with it. */
function StatusClock() {
  const minute = useGameMinute(1_000);
  return <span className="tabular">{formatClock12(minute)}</span>;
}
