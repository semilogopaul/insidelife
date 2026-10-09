'use client';

import { useState } from 'react';
import { findAdSlot, type BillboardSlotId } from '@insidelife/shared';
import { Spinner, Tabs } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { env } from '@/config/env';
import { useSlots } from '../hooks/use-promote';
import { BillboardsTab, type BillboardsView } from './billboards/BillboardsTab';
import { BookingFlow } from './billboards/BookingFlow';
import { ClubDjTab } from './club/ClubDjTab';

type PromoteTab = 'billboards' | 'club';

const TABS = [
  { id: 'billboards', label: 'Billboards' },
  { id: 'club', label: 'Club DJ' },
] as const;

/**
 * Promote phone app: real-money billboard ads over the city and paid club plays for artists. Deep links:
 * `openPhone('promote', '<billboard slot id>' | 'campaigns' | 'tracks')` (the billboard house ad opens a slot).
 */
export function PromoteApp() {
  const param = useUi((state) => state.phoneParam);
  const [tab, setTab] = useState<PromoteTab>(param === 'tracks' ? 'club' : 'billboards');
  const [view, setView] = useState<BillboardsView>(param === 'campaigns' ? 'mine' : 'boards');
  const [booking, setBooking] = useState<BillboardSlotId | null>(param && findAdSlot(param) ? param : null);
  const slots = useSlots();

  // Booking takes the whole screen: one job at a time.
  if (booking) {
    const slot = slots.data?.slots.find((item) => item.id === booking);
    if (slot && slots.data) return <BookingFlow slot={slot} catalog={slots.data} onExit={() => setBooking(null)} />;
    if (slots.isPending) return <Spinner className="mx-auto my-16 block text-text-soft" />;
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="relative overflow-hidden rounded-sheet bg-danfo px-4 py-4 text-ink">
        <p className="type-slogan text-[2rem] uppercase">Make Lagos see you</p>
        <p className="mt-1 max-w-[30ch] text-sm">Your ad on 560+ spots: billboards, bus shelters, Lagos TV and every player’s phone. Your song in the clubs. Real money, reviewed by a person, refunded if not approved.</p>
        <span aria-hidden className="mt-3 block h-[9px] w-24 danfo-stripes" />
      </div>
      <Tabs items={TABS} value={tab} onChange={setTab} label="Promote" />
      <div role="tabpanel" aria-label={tab === 'billboards' ? 'Billboards' : 'Club DJ'}>
        {tab === 'billboards' ? <BillboardsTab view={view} onView={setView} onBook={setBooking} /> : <ClubDjTab />}
      </div>
      <p className="text-center text-xs text-text-soft">
        Questions about ads or a refund?{' '}
        <a href={`mailto:${env.supportEmail}`} className="font-bold underline">
          {env.supportEmail}
        </a>
      </p>
    </div>
  );
}
