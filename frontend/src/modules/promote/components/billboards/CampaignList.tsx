'use client';

import { ChevronRight, Eye, Megaphone, Users } from 'lucide-react';
import { runLengthLabel, type AdCampaignDto, type BillboardSlotDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, EmptyState, Spinner } from '@/common/components';
import { PaymentAmount } from '@/common/payments';
import { useCancelCampaign, useCampaigns } from '../../hooks/use-promote';
import { formatRange } from '../../services/rules';
import { STATUS_META } from '../../services/status';
import { PendingPayment } from '../detail/PendingPayment';
import { StatusBadge } from '../shared';

/** Your bookings with their status and views; tap one for everything you paid for. */
export function CampaignList({ slots, onBrowse, onOpen }: { readonly slots: readonly BillboardSlotDto[]; readonly onBrowse: () => void; readonly onOpen: (campaignId: string) => void }) {
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
    return <EmptyState icon={Megaphone} title="No ads yet" body="Put your brand above Third Mainland Bridge traffic, on a bus shelter or on every player’s phone." action={<Button onClick={onBrowse}>Find a spot</Button>} />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {campaigns.data.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} aspect={aspectFor(slots, campaign.slotId)} onOpen={() => onOpen(campaign.id)} />
      ))}
    </ul>
  );
}

const aspectFor = (slots: readonly BillboardSlotDto[], slotId: string): string => {
  const slot = slots.find((item) => item.id === slotId);
  return slot ? `${slot.width} / ${slot.height}` : '3 / 1';
};

function CampaignCard({ campaign, aspect, onOpen }: { readonly campaign: AdCampaignDto; readonly aspect: string; readonly onOpen: () => void }) {
  const cancel = useCancelCampaign();
  const meta = STATUS_META[campaign.status];
  const showsReach = campaign.status === 'live' || campaign.status === 'completed' || campaign.impressions > 0;
  return (
    <li className="overflow-hidden rounded-sheet ring-1 ring-line">
      <button type="button" onClick={onOpen} className="flex w-full gap-3 p-3 text-left hover:bg-paper-2" aria-label={`${campaign.title}: ${meta.label}. Open what you paid for`}>
        <span className="relative w-24 shrink-0 self-start overflow-hidden rounded-chip bg-ink" style={{ aspectRatio: aspect, maxHeight: 96 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- media-server URL, already sized by the server */}
          <img src={campaign.creativeUrl} alt="" className="absolute inset-0 size-full object-cover" />
        </span>
        <span className="min-w-0 flex-1">
          <StatusBadge status={campaign.status} />
          <span className="mt-1 block truncate font-bold leading-tight">{campaign.title}</span>
          <span className="block truncate text-xs text-text-soft">
            {campaign.slotName} · {formatRange(campaign.startDate, campaign.endDate)}
          </span>
          <span className="block text-xs text-text-soft">
            <PaymentAmount currency={campaign.currency} minor={campaign.chargeMinor} /> · {runLengthLabel(campaign.days)}
          </span>
          {showsReach && (
            <span className="mt-1 flex gap-3 text-xs">
              <span className="inline-flex items-center gap-1">
                <Eye size={13} aria-hidden /> <strong className="tabular">{campaign.impressions.toLocaleString('en-NG')}</strong> views
              </span>
              <span className="inline-flex items-center gap-1">
                <Users size={13} aria-hidden /> <strong className="tabular">{campaign.uniqueViewers.toLocaleString('en-NG')}</strong> players
              </span>
            </span>
          )}
        </span>
        <ChevronRight size={18} aria-hidden className="shrink-0 self-center text-text-faint" />
      </button>
      {(campaign.status === 'pending-payment' || campaign.rejectionReason) && (
        <div className="flex flex-col gap-2 border-t border-line bg-paper-2 px-3 py-2.5 text-sm">
          {campaign.rejectionReason && (campaign.status === 'rejected' || campaign.status === 'refund-due' || campaign.status === 'refunded') && (
            <p>
              <span className="font-bold">Moderator: </span>“{campaign.rejectionReason}”
              {campaign.status === 'refund-due' && <span className="block text-text-soft">{meta.next}</span>}
            </p>
          )}
          {campaign.status === 'pending-payment' && (
            <PendingPayment
              compact
              paymentReference={campaign.paymentReference}
              checkoutUrl={campaign.checkoutUrl}
              holdExpiresAt={campaign.holdExpiresAt}
              onCancel={async () => {
                await cancel.mutateAsync(campaign.id);
              }}
            />
          )}
        </div>
      )}
    </li>
  );
}
