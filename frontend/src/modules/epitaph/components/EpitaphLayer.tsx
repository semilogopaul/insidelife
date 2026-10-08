'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { gameEvents } from '@/common/game/game-events';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { useEpitaphData } from '../hooks/use-epitaph-data';
import { EpitaphScreen } from './EpitaphScreen';

/**
 * In-game: when the server reports a `succession` (your character died), show the epitaph over the world. If an
 * heir continues, "Continue as <heir>" refreshes everything for the new character.
 */
export function EpitaphLayer({ createPath = '/create' }: { readonly createPath?: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const { lastLife, legacy } = useEpitaphData(open);

  useRealtimeEvent('character:invalidate', ({ reason }) => {
    if (reason !== 'succession') return;
    gameEvents.emit('music-context', { context: 'menu' });
    setOpen(true);
    void client.invalidateQueries({ queryKey: ['domain', 'epitaph'] });
  });

  const ready = open && lastLife.data && !legacy.isPending;
  return (
    <AnimatePresence>
      {ready && lastLife.data && (
        <motion.div key="epitaph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }}>
          <EpitaphScreen
            lastLife={lastLife.data}
            legacy={legacy.data ?? []}
            onContinue={() => {
              setOpen(false);
              void client.invalidateQueries();
            }}
            onStartNewLife={() => router.push(createPath)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
