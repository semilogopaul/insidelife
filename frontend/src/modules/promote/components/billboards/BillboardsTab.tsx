'use client';

import { useMemo, useState } from 'react';
import { AD_SLOT_KIND_LABELS, DISTRICTS, type AdSlotKind, type BillboardSlotId, type DistrictId } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, FilterChips, SelectField, Spinner, Tabs } from '@/common/components';
import { useCampaigns, useSlots } from '../../hooks/use-promote';
import { CampaignList } from './CampaignList';
import { SlotCard } from './SlotCard';

/** Kinds in the order advertisers think about them (biggest reach first). */
const KINDS: readonly AdSlotKind[] = ['premium-billboard', 'lagos-tv', 'phone-app', 'street-billboard', 'bus-shelter', 'totem', 'stadium-led', 'market-banner', 'park-board'];
const KIND_LINES: Readonly<Record<AdSlotKind, string>> = {
  'premium-billboard': 'The 12 giant boards: airport, Third Mainland Bridge, Lekki toll gate.',
  'lagos-tv': 'Every TV in the game — homes, bukas, bars and offices.',
  'phone-app': 'An app on every player’s home screen. Few slots, big reach.',
  'street-billboard': 'Pole boards on the main roads of every district.',
  'bus-shelter': 'Lit panels where commuters wait.',
  totem: 'Pavement lightboxes on side streets. Cheap and local.',
  'stadium-led': 'Pitch-side LED around the stadium.',
  'market-banner': 'Banners over the stalls in the big markets.',
  'park-board': 'Boards over the bays at the motor parks.',
};
const PAGE = 20;

export type BillboardsView = 'boards' | 'mine';

export interface BillboardsTabProps {
  readonly view: BillboardsView;
  readonly onView: (view: BillboardsView) => void;
  readonly onBook: (slotId: BillboardSlotId) => void;
}

/** Every ad spot for sale, by kind and district (cheapest first), plus your campaigns. */
export function BillboardsTab({ view, onView, onBook }: BillboardsTabProps) {
  const slots = useSlots();
  const campaigns = useCampaigns();
  const [kind, setKind] = useState<AdSlotKind>('premium-billboard');
  const [district, setDistrict] = useState<DistrictId | 'all'>('all');
  const [shown, setShown] = useState(PAGE);

  const all = slots.data?.slots;
  const kinds = useMemo(() => KINDS.filter((candidate) => all?.some((slot) => slot.kind === candidate)), [all]);
  const list = useMemo(
    () =>
      (all ?? [])
        .filter((slot) => slot.kind === kind && (district === 'all' || slot.districtId === district))
        .toSorted((a, b) => a.weekPriceKobo - b.weekPriceKobo || a.name.localeCompare(b.name)),
    [all, kind, district],
  );
  const districts = useMemo(() => {
    const ids = new Set((all ?? []).filter((slot) => slot.kind === kind && slot.districtId).map((slot) => slot.districtId as DistrictId));
    return [...ids].toSorted((a, b) => DISTRICTS[a].name.localeCompare(DISTRICTS[b].name));
  }, [all, kind]);

  const active = campaigns.data?.filter((campaign) => ['pending-payment', 'in-review', 'approved', 'live', 'refund-due'].includes(campaign.status)).length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        items={[
          { id: 'boards', label: 'Book a spot' },
          { id: 'mine', label: 'My campaigns', badge: active },
        ]}
        value={view}
        onChange={onView}
        label="Billboards"
      />
      <div role="tabpanel" aria-label={view === 'boards' ? 'Book a spot' : 'My campaigns'}>
        {view === 'mine' ? (
          <CampaignList slots={all ?? []} onBrowse={() => onView('boards')} />
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
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-soft">
              <strong className="text-text">{all?.length ?? 0} places</strong> to put your brand in front of players.
            </p>
            <FilterChips
              label="Kind of spot"
              value={kind}
              onChange={(next) => {
                setKind(next);
                setDistrict('all');
                setShown(PAGE);
              }}
              options={kinds.map((id) => ({ id, label: AD_SLOT_KIND_LABELS[id] }))}
            />
            <p className="text-xs text-text-soft">{KIND_LINES[kind]}</p>
            {districts.length > 1 && (
              <SelectField
                label="District"
                value={district}
                onChange={(value) => {
                  setDistrict(value as DistrictId | 'all');
                  setShown(PAGE);
                }}
                options={[{ value: 'all', label: `All districts (${districts.length})` }, ...districts.map((id) => ({ value: id, label: DISTRICTS[id].name }))]}
              />
            )}
            <ul className="grid grid-cols-2 gap-2.5">
              {list.slice(0, shown).map((item) => (
                <li key={item.id}>
                  <SlotCard slot={item} today={slots.data?.today ?? ''} onOpen={() => onBook(item.id)} />
                </li>
              ))}
            </ul>
            {list.length > shown && (
              <Button variant="paper" onClick={() => setShown((count) => count + PAGE)}>
                Show more ({list.length - shown} left)
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
