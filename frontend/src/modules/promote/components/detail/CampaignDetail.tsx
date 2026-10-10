'use client';

import { CalendarDays, Eye, Info, MapPin, Repeat, Users } from 'lucide-react';
import { AD_SLOT_KIND_LABELS, BILLBOARD_FORMAT_SPECS, DISTRICTS, findAdSlot, runLengthLabel, type AdCampaignDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Section, Spinner, StatTile } from '@/common/components';
import { useCampaignDetail, useCancelCampaign } from '../../hooks/use-promote';
import { formatRunDays } from '../../services/rules';
import { STATUS_META } from '../../services/status';
import { StatusBadge, StepHeader } from '../shared';
import { PendingPayment } from './PendingPayment';
import { ReceiptCard } from './ReceiptCard';
import { SeeItInLagos } from './SeeItInLagos';
import { Timeline } from './Timeline';

const RERUNNABLE = new Set(['completed', 'refunded', 'rejected', 'cancelled', 'refund-due', 'live', 'approved']);

export interface CampaignDetailProps {
  readonly campaignId: string;
  readonly onBack: () => void;
  /** "Run it again": a new booking of this slot at today's price, reusing the image when it's still there. */
  readonly onRunAgain: (campaign: AdCampaignDto) => void;
}

/**
 * "What you paid for": the ad itself, where and when it runs, what happened to it (paid → in review → approved →
 * live → ended, or why not), the receipt, its views, and how to go and see it in Lagos.
 */
export function CampaignDetail({ campaignId, onBack, onRunAgain }: CampaignDetailProps) {
  const detail = useCampaignDetail(campaignId);
  const cancel = useCancelCampaign();

  if (detail.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <StepHeader title="Your ad" onBack={onBack} backLabel="Back to my campaigns" />
        <Spinner className="mx-auto my-10 block text-text-soft" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="flex flex-col gap-4">
        <StepHeader title="Your ad" onBack={onBack} backLabel="Back to my campaigns" />
        <div className="rounded-card bg-okada-soft p-4 text-sm">
          <p className="text-okada">{errorMessage(detail.error)}</p>
          <Button variant="paper" size="sm" className="mt-2" onClick={() => void detail.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const { campaign, timeline, receipt } = detail.data;
  const slot = findAdSlot(campaign.slotId);
  const spec = slot ? BILLBOARD_FORMAT_SPECS[slot.format] : null;
  const meta = STATUS_META[campaign.status];
  const ran = campaign.status === 'live' || campaign.status === 'completed' || campaign.impressions > 0;
  const physical = slot !== undefined && slot.kind !== 'lagos-tv' && slot.kind !== 'phone-app';

  return (
    <div className="flex flex-col gap-5 pb-2">
      <StepHeader title={campaign.title} onBack={onBack} backLabel="Back to my campaigns" aside={<StatusBadge status={campaign.status} />} />

      <div className="overflow-hidden rounded-sheet bg-ink" style={{ aspectRatio: slot ? `${slot.width} / ${slot.height}` : '3 / 1', maxHeight: 280 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- media-server URL, already sized by the server */}
        <img src={campaign.creativeUrl} alt={`Your ad: ${campaign.title}`} className="mx-auto h-full w-auto max-w-full object-contain" />
      </div>
      <p className="-mt-2 text-sm text-text-soft">{campaign.rejectionReason && (campaign.status === 'rejected' || campaign.status === 'refund-due' || campaign.status === 'refunded') ? `Moderator: “${campaign.rejectionReason}”` : meta.next}</p>

      <dl className="grid gap-2.5 text-sm">
        <div className="flex gap-2.5">
          <dt className="sr-only">Where</dt>
          <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-lagoon" />
          <dd>
            <span className="font-bold">{campaign.slotName}</span>
            <span className="block text-text-soft">
              {slot ? AD_SLOT_KIND_LABELS[slot.kind] : 'Ad spot'}
              {spec ? ` · ${spec.label} ${spec.aspect}` : ''}
              {slot?.districtId ? ` · ${DISTRICTS[slot.districtId].name}` : slot ? ' · Citywide' : ''}
            </span>
          </dd>
        </div>
        <div className="flex gap-2.5">
          <dt className="sr-only">When</dt>
          <CalendarDays size={18} aria-hidden className="mt-0.5 shrink-0 text-lagoon" />
          <dd>
            <span className="font-bold">{formatRunDays(campaign.startDate, campaign.endDate)}</span>
            <span className="block text-text-soft">
              {runLengthLabel(campaign.days)}
              {campaign.blockDays !== 7 ? ` (${campaign.blocks} × ${campaign.blockDays}-day blocks)` : ''}, whole days Lagos time
            </span>
          </dd>
        </div>
      </dl>

      {ran && (
        <Section title="Views">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Views" value={<span className="inline-flex items-center gap-1.5"><Eye size={16} aria-hidden />{campaign.impressions.toLocaleString('en-NG')}</span>} />
            <StatTile label="Different players" value={<span className="inline-flex items-center gap-1.5"><Users size={16} aria-hidden />{campaign.uniqueViewers.toLocaleString('en-NG')}</span>} />
          </div>
          <details className="mt-2 text-sm">
            <summary className="flex cursor-pointer items-center gap-1.5 font-bold text-text-soft">
              <Info size={15} aria-hidden /> How views are counted
            </summary>
            <p className="mt-1.5 text-text-soft">
              {slot?.kind === 'phone-app'
                ? 'A view is a player whose home screen showed your app. '
                : slot?.kind === 'lagos-tv'
                  ? 'A view is a player in a room with a TV while your ad is on screen. '
                  : 'A view is a player within about 40 m of the board, with it on their screen for at least a second (walking, driving or riding past). '}
              Each player counts once per game hour, and the server checks every view against where the player really is, so views can’t be faked.
            </p>
          </details>
        </Section>
      )}

      <Section title="What happened">
        <Timeline steps={timeline} />
      </Section>

      {campaign.status === 'pending-payment' && (
        <PendingPayment
          paymentReference={campaign.paymentReference}
          checkoutUrl={campaign.checkoutUrl}
          holdExpiresAt={campaign.holdExpiresAt}
          onCancel={async () => {
            await cancel.mutateAsync(campaign.id);
          }}
        />
      )}

      <Section title="Receipt">
        <ReceiptCard receipt={receipt} />
      </Section>

      {slot && (
        <Section title={physical ? 'See it in Lagos' : slot.kind === 'phone-app' ? 'On every phone' : 'On Lagos TV'}>
          <SeeItInLagos slot={slot} creativeUrl={campaign.creativeUrl} title={campaign.title} tagline={campaign.tagline} />
        </Section>
      )}

      {slot && RERUNNABLE.has(campaign.status) && (
        <div className="sticky bottom-0 -mx-1 bg-paper px-1 pb-1 pt-2">
          <Button size="lg" block variant={campaign.status === 'live' || campaign.status === 'approved' ? 'paper' : 'danfo'} icon={<Repeat size={18} aria-hidden />} onClick={() => onRunAgain(campaign)}>
            {campaign.status === 'live' || campaign.status === 'approved' ? 'Book it again after this run' : 'Run it again'}
          </Button>
          <p className="mt-1.5 text-center text-xs text-text-soft">A new booking at today’s price, from the spot’s next free day.</p>
        </div>
      )}
    </div>
  );
}
