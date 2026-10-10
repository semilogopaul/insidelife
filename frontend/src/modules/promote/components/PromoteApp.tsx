'use client';

import { useState } from 'react';
import { BILLBOARD_FORMAT_SPECS, findAdSlot, type AdCampaignDto, type BillboardSlotId } from '@insidelife/shared';
import { Spinner, Tabs } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { site } from '@/config/site';
import { useSlots } from '../hooks/use-promote';
import { parsePromoteLink, type PromoteRoute } from '../services/deep-links';
import { BillboardsTab, type BillboardsView } from './billboards/BillboardsTab';
import { BookingFlow, type BookingRerun } from './billboards/BookingFlow';
import { ClubDjTab } from './club/ClubDjTab';
import { SongDetail } from './club/SongDetail';
import { CampaignDetail } from './detail/CampaignDetail';

type PromoteTab = 'billboards' | 'club';

const TABS = [
  { id: 'billboards', label: 'Billboards' },
  { id: 'club', label: 'Club DJ' },
] as const;

/** A screen that takes the whole app: one job at a time. */
type Focus =
  | { readonly kind: 'book'; readonly slotId: BillboardSlotId; readonly rerun?: BookingRerun }
  | { readonly kind: 'campaign'; readonly id: string }
  | { readonly kind: 'song'; readonly orderId: string; readonly venueId: string | null }
  | null;

function focusOf(route: PromoteRoute): Focus {
  if (route.kind === 'book') return { kind: 'book', slotId: route.slotId };
  if (route.kind === 'campaign') return { kind: 'campaign', id: route.id };
  if (route.kind === 'song') return { kind: 'song', orderId: route.orderId, venueId: route.venueId };
  return null;
}

/** "Run it again": the same spot at today's price, with the image (when still stored) and words of the earlier booking. */
function rerunOf(campaign: AdCampaignDto): BookingRerun {
  const slot = findAdSlot(campaign.slotId);
  const spec = slot ? BILLBOARD_FORMAT_SPECS[slot.format] : null;
  return {
    title: campaign.title,
    linkUrl: campaign.linkUrl,
    tagline: campaign.tagline,
    creative: campaign.creativeKey && slot && spec ? { creativeKey: campaign.creativeKey, url: campaign.creativeUrl, format: slot.format, width: spec.width, height: spec.height, bytes: 0 } : null,
  };
}

/**
 * Promote phone app: real-money ads over the city and paid club plays for artists, and "what you paid for" for each.
 * Deep links (`openPhone('promote', param)`, see `parsePromoteLink`): a slot id (book it), `campaigns`, `tracks`,
 * `campaign:<id>`, `song:<orderId>` and `song:<orderId>:<venueId>` (the server's notices use these).
 */
export function PromoteApp() {
  const param = useUi((state) => state.phoneParam);
  const route = parsePromoteLink(param);
  const [tab, setTab] = useState<PromoteTab>(route.kind === 'tracks' || route.kind === 'song' ? 'club' : 'billboards');
  const [view, setView] = useState<BillboardsView>(route.kind === 'campaigns' || route.kind === 'campaign' ? 'mine' : 'boards');
  const [focus, setFocus] = useState<Focus>(() => focusOf(route));
  const [rebookTrack, setRebookTrack] = useState<string | null>(null);
  // A new deep link while Promote is already open jumps there (adjusting state during render, not an effect).
  const [linked, setLinked] = useState(param);
  if (param !== linked) {
    setLinked(param);
    const next = parsePromoteLink(param);
    setFocus(focusOf(next));
    if (next.kind === 'song' || next.kind === 'tracks') setTab('club');
    if (next.kind === 'campaign' || next.kind === 'campaigns') {
      setTab('billboards');
      setView('mine');
    }
  }
  const slots = useSlots();

  if (focus?.kind === 'book') {
    const slot = slots.data?.slots.find((item) => item.id === focus.slotId);
    if (slot && slots.data) return <BookingFlow slot={slot} catalog={slots.data} rerun={focus.rerun} onExit={() => setFocus(null)} />;
    if (slots.isPending) return <Spinner className="mx-auto my-16 block text-text-soft" />;
  }
  if (focus?.kind === 'campaign') {
    return (
      <CampaignDetail
        campaignId={focus.id}
        onBack={() => {
          setFocus(null);
          setTab('billboards');
          setView('mine');
        }}
        onRunAgain={(campaign) => setFocus({ kind: 'book', slotId: campaign.slotId, rerun: rerunOf(campaign) })}
      />
    );
  }
  if (focus?.kind === 'song') {
    return (
      <SongDetail
        orderId={focus.orderId}
        goToVenueId={focus.venueId}
        onBack={() => {
          setFocus(null);
          setTab('club');
        }}
        onRunAgain={(trackId) => {
          setRebookTrack(trackId);
          setFocus(null);
          setTab('club');
        }}
      />
    );
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
        {tab === 'billboards' ? (
          <BillboardsTab view={view} onView={setView} onBook={(slotId) => setFocus({ kind: 'book', slotId })} onOpenCampaign={(id) => setFocus({ kind: 'campaign', id })} />
        ) : (
          <ClubDjTab key={rebookTrack ?? 'tracks'} initialOrdering={rebookTrack} onOpenOrder={(orderId) => setFocus({ kind: 'song', orderId, venueId: null })} />
        )}
      </div>
      <p className="text-center text-xs text-text-soft">
        Questions about ads or a refund?{' '}
        <a href={`mailto:${site.supportEmail}`} className="font-bold underline">
          {site.supportEmail}
        </a>
      </p>
    </div>
  );
}
