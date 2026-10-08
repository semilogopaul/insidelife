'use client';

import { useRef } from 'react';
import { gameEvents } from '@/common/game/game-events';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { MoneyRain, type MoneyRainHandle } from '../../interiors';

/** Inside a venue: `party:spray` at this venue rains notes over the room (rendered as a child of the interior). */
export function InteriorSpray({ venueId }: { readonly venueId: string }) {
  const rain = useRef<MoneyRainHandle>(null);
  useRealtimeEvent('party:spray', (spray) => {
    if (spray.venueId !== venueId) return;
    rain.current?.burst(spray.amount >= 100_000 ? 70 : 40);
    gameEvents.emit('sfx', { id: 'spray' });
  });
  return <MoneyRain ref={rain} />;
}
