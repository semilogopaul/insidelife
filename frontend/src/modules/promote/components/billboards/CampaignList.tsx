'use client';

import { Eye, Megaphone, MousePointerClick } from 'lucide-react';
import { koboToNaira, type AdCampaignDto, type BillboardSlotDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, EmptyState, Money, Spinner, toast } from '@/common/components';
import { useNow } from '@/common/hooks/use-now';
import { useCancelCampaign, useCampaigns } from '../../hooks/use-promote';
import { formatRange } from '../../services/rules';
import { STATUS_META } from '../../services/status';
import { StatusBadge } from '../shared';

const clock = new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' });

/** Your bookings with status, reach (impressions, clicks) and the one action each status allows. */
export function CampaignList({ slots, onBrowse }: { readonly slots: readonly BillboardSlotDto[]; readonly onBrowse: () => void }) {
  const campaigns = useCampaigns();
  if (campaigns.isPending) return <Spinner className="mx-auto my-10 text-text-soft" />;
  if (campaigns.isError) {
    return (
      <div className="rounded-card bg-okada-soft p-4 text-sm">
        <p className="text-okada">{errorMessage(campaigns.error)}</p>
        <Button variant="paper" size="sm" className="mt-2" onClick={() => void campaigns.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (campaigns.data.length === 0) {
    return <EmptyState icon={Megaphone} title="No billboards yet" body="Put your brand above Third Mainland Bridge traffic from ₦2,500 a day." action={<Button onClick={onBrowse}>Find a board</Button>} />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {campaigns.data.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} aspect={aspectFor(slots, campaign.slotId)} />
      ))}
    </ul>
  );
}

const aspectFor = (slots: readonly BillboardSlotDto[], slotId: string): string => {
  const slot = slots.find((item) => item.id === slotId);
  return slot ? `${slot.width} / ${slot.height}` : '3 / 1';
};

function CampaignCard({ campaign, aspect }: { readonly campaign: AdCampaignDto; readonly aspect: string }) {
  const cancel = useCancelCampaign();
  const now = useNow();
  const meta = STATUS_META[campaign.status];
  const holdOpen = campaign.holdExpiresAt !== null && Date.parse(campaign.holdExpiresAt) > now;
  const showsReach = campaign.status === 'live' || campaign.status === 'completed' || campaign.impressions > 0;
  return (
    <li className="overflow-hidden rounded-sheet ring-1 ring-line">
      <div className="flex gap-3 p-3">
        <div className="relative w-24 shrink-0 self-start overflow-hidden rounded-chip bg-ink" style={{ aspectRatio: aspect, maxHeight: 96 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- media-server URL, already sized by the server */}
          <img src={campaign.creativeUrl} alt="" className="absolute inset-0 size-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={campaign.status} />
          </div>
          <p className="mt-1 truncate font-bold leading-tight">{campaign.title}</p>
          <p className="truncate text-xs text-text-soft">
            {campaign.slotName} · {formatRange(campaign.startDate, campaign.endDate)}
          </p>
          <p className="text-xs text-text-soft">
            <Money amount={koboToNaira(campaign.amountKobo)} /> · {campaign.days} {campaign.days === 1 ? 'day' : 'days'}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-line bg-paper-2 px-3 py-2.5 text-sm">
        {campaign.rejectionReason && (campaign.status === 'rejected' || campaign.status === 'refund-due' || campaign.status === 'refunded') ? (
          <p>
            <span className="font-bold">Moderator: </span>“{campaign.rejectionReason}”
            {campaign.status === 'refund-due' && <span className="block text-text-soft">{meta.next}</span>}
          </p>
        ) : (
          <p className="text-text-soft">{meta.next}</p>
        )}
        {showsReach && (
          <p className="flex gap-4 text-xs">
            <span className="inline-flex items-center gap-1">
              <Eye size={13} aria-hidden /> <strong className="tabular">{campaign.impressions.toLocaleString('en-NG')}</strong> views
            </span>
            <span className="inline-flex items-center gap-1">
              <MousePointerClick size={13} aria-hidden /> <strong className="tabular">{campaign.clicks.toLocaleString('en-NG')}</strong> clicks
            </span>
          </p>
        )}
        {campaign.status === 'pending-payment' && (
          <div className="flex flex-wrap items-center gap-2">
            {campaign.checkoutUrl && holdOpen && (
              <Button size="sm" onClick={() => campaign.checkoutUrl && window.location.assign(campaign.checkoutUrl)}>
                Finish payment
              </Button>
            )}
            <Button
              size="sm"
              variant="paper"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(campaign.id, {
                  onSuccess: () => toast({ title: 'Booking cancelled', body: 'Nothing was charged.', tone: 'neutral' }),
                  onError: (error) => toast({ title: 'Couldn’t cancel', body: errorMessage(error), tone: 'bad' }),
                })
              }
            >
              Cancel booking
            </Button>
            {campaign.holdExpiresAt && (
              <span className="text-xs text-text-soft">{holdOpen ? `Held until ${clock.format(new Date(campaign.holdExpiresAt))}` : 'Hold expired — book again if the board is free'}</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
