'use client';

import { useMemo } from 'react';
import { DISTRICTS, type BillboardSlotId, type DistrictSide } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Spinner, Tabs } from '@/common/components';
import { useCampaigns, useSlots } from '../../hooks/use-promote';
import { CampaignList } from './CampaignList';
import { SlotCard } from './SlotCard';

const SIDES: ReadonlyArray<{ readonly side: DistrictSide; readonly title: string; readonly line: string }> = [
  { side: 'island', title: 'The Island', line: 'VI, Lekki and Lagos Island — money and nightlife traffic.' },
  { side: 'mainland', title: 'The Mainland', line: 'Ikeja, Yaba, Surulere and the bridge — the daily grind.' },
  { side: 'outskirts', title: 'Outskirts', line: 'Ajah, Ikorodu and beyond — cheap and local.' },
];

export type BillboardsView = 'boards' | 'mine';

export interface BillboardsTabProps {
  readonly view: BillboardsView;
  readonly onView: (view: BillboardsView) => void;
  readonly onBook: (slotId: BillboardSlotId) => void;
}

/** 12 boards grouped like a map of Lagos (Island / Mainland / Outskirts), plus your campaigns. */
export function BillboardsTab({ view, onView, onBook }: BillboardsTabProps) {
  const slots = useSlots();
  const campaigns = useCampaigns();
  const groups = useMemo(() => {
    const all = slots.data?.slots ?? [];
    return SIDES.map((group) => ({ ...group, slots: all.filter((slot) => DISTRICTS[slot.districtId].side === group.side) })).filter((group) => group.slots.length > 0);
  }, [slots.data]);

  const active = campaigns.data?.filter((campaign) => ['pending-payment', 'in-review', 'approved', 'live', 'refund-due'].includes(campaign.status)).length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        items={[
          { id: 'boards', label: 'Book a board' },
          { id: 'mine', label: 'My campaigns', badge: active },
        ]}
        value={view}
        onChange={onView}
        label="Billboards"
      />
      <div role="tabpanel" aria-label={view === 'boards' ? 'Book a board' : 'My campaigns'}>
        {view === 'mine' ? (
          <CampaignList slots={slots.data?.slots ?? []} onBrowse={() => onView('boards')} />
        ) : slots.isPending ? (
          <Spinner className="mx-auto my-10 block text-text-soft" />
        ) : slots.isError ? (
          <div className="rounded-card bg-okada-soft p-4 text-sm">
            <p className="text-okada">{errorMessage(slots.error)}</p>
            <Button variant="paper" size="sm" className="mt-2" onClick={() => void slots.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.side} aria-labelledby={`side-${group.side}`}>
                <h4 id={`side-${group.side}`} className="type-title text-lg">
                  {group.title}
                </h4>
                <p className="mb-2 text-xs text-text-soft">{group.line}</p>
                <ul className="grid grid-cols-2 gap-2.5">
                  {group.slots.map((item) => (
                    <li key={item.id}>
                      <SlotCard slot={item} onOpen={() => onBook(item.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
