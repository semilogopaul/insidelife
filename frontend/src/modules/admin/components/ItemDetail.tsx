'use client';

import { Check, Copy, Link2Off } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { BILLBOARD_SLOTS, findVenue, koboToNaira, type ModerationCampaignDto, type ModerationClubOrderDto } from '@insidelife/shared';
import { Money } from '@/common/components';
import type { QueueItem } from '../services/queue';

const realDate = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const calendarDay = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const day = (iso: string): string => calendarDay.format(new Date(`${iso}T00:00:00Z`));
const lastDay = (exclusiveEnd: string): string => day(new Date(Date.parse(`${exclusiveEnd}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
const when = (iso: string | null): string => (iso ? realDate.format(new Date(iso)) : '—');

/** Everything a moderator needs to judge one item. Links are text only: never rendered as anchors or opened. */
export function ItemDetail({ item }: { readonly item: QueueItem }) {
  return item.kind === 'campaigns' ? <CampaignDetail campaign={item.campaign} /> : <ClubOrderDetail order={item.order} />;
}

function CampaignDetail({ campaign }: { readonly campaign: ModerationCampaignDto }) {
  const slot = BILLBOARD_SLOTS.find((entry) => entry.id === campaign.slotId);
  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-sheet bg-ink p-3">
        <div className="relative mx-auto max-h-[46vh] overflow-hidden rounded-card" style={{ aspectRatio: slot ? `${slot.width} / ${slot.height}` : '3 / 1', maxWidth: slot?.format === 'portrait' ? 300 : undefined }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- moderator view of the stored creative */}
          <img src={campaign.creativeUrl} alt={`Creative for “${campaign.title}”`} className="absolute inset-0 size-full object-contain" />
        </div>
      </div>
      <header>
        <p className="text-sm font-bold text-text-soft">Billboard ad · {campaign.slotName}</p>
        <h2 className="type-title text-3xl leading-tight">{campaign.title}</h2>
      </header>
      <LinkBox url={campaign.linkUrl} />
      <Facts
        rows={[
          ['Owner', <Owner key="o" handle={campaign.ownerHandle} userId={campaign.ownerUserId} />],
          ['Runs', `${day(campaign.startDate)} – ${lastDay(campaign.endDate)} (${campaign.days} ${campaign.days === 1 ? 'day' : 'days'})`],
          ['Paid', <Money key="m" amount={koboToNaira(campaign.amountKobo)} />],
          ['Payment reference', <Copyable key="r" text={campaign.paymentReference ?? '—'} />],
          ['Booked / paid', `${when(campaign.createdAt)} / ${when(campaign.paidAt)}`],
          ...(campaign.rejectionReason ? ([['Reason given', campaign.rejectionReason]] as Array<[string, ReactNode]>) : []),
        ]}
      />
    </div>
  );
}

function ClubOrderDetail({ order }: { readonly order: ModerationClubOrderDto }) {
  const minutes = Math.floor(order.track.durationSeconds / 60);
  const seconds = String(Math.round(order.track.durationSeconds % 60)).padStart(2, '0');
  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-sm font-bold text-text-soft">Club play · {order.productName}</p>
        <h2 className="type-title text-3xl leading-tight">{order.track.title}</h2>
        <p className="text-lg text-text-soft">{order.track.artistName}</p>
      </header>
      <div className="rounded-sheet bg-paper-2 p-4">
        <p className="mb-2 text-sm text-text-soft">
          Listen to the whole song before approving ({minutes}:{seconds}). Hate lyrics and music the buyer doesn’t own are not allowed; explicit lyrics are fine.
        </p>
        <audio controls preload="metadata" src={order.track.audioUrl} className="w-full" aria-label={`${order.track.title} by ${order.track.artistName}`}>
          <track kind="captions" />
        </audio>
      </div>
      <Facts
        rows={[
          ['Owner', <Owner key="o" handle={order.ownerHandle} userId={order.ownerUserId} />],
          ['Where', order.allClubs ? 'Every club and lounge' : order.clubs.map((id) => findVenue(id)?.name ?? id).join(', ')],
          ['Runs', `${day(order.startDate)} – ${lastDay(order.endDate)} (${order.days} ${order.days === 1 ? 'day' : 'days'})`],
          ['Paid', <Money key="m" amount={koboToNaira(order.amountKobo)} />],
          ['Payment reference', <Copyable key="r" text={order.paymentReference ?? '—'} />],
          ['Booked / paid', `${when(order.createdAt)} / ${when(order.paidAt)}`],
          ...(order.rejectionReason ? ([['Reason given', order.rejectionReason]] as Array<[string, ReactNode]>) : []),
        ]}
      />
    </div>
  );
}

function Facts({ rows }: { readonly rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-text-soft">{label}</dt>
          <dd className="min-w-0 break-words font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Owner({ handle, userId }: { readonly handle: string | null; readonly userId: string }) {
  return (
    <span>
      {handle ? `@${handle}` : 'No living character'} <span className="font-normal text-text-faint">· account {userId.slice(0, 8)}</span>
    </span>
  );
}

/** The destination as inert text with its host called out, plus copy. Never an anchor, never auto-opened. */
function LinkBox({ url }: { readonly url: string }) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = 'unreadable link';
  }
  return (
    <section aria-label="Ad link" className="rounded-sheet ring-1 ring-line">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="flex items-center gap-2 text-sm">
          <Link2Off size={16} aria-hidden className="text-text-soft" />
          Goes to <strong className="text-base">{host}</strong>
        </p>
        <Copyable text={url} label="Copy link" />
      </div>
      <p className="break-all px-4 py-3 font-mono text-sm text-text">{url}</p>
      <p className="border-t border-line px-4 py-2 text-xs text-text-soft">Shown as text on purpose. Check it in an isolated browser; does it match the ad?</p>
    </section>
  );
}

function Copyable({ text, label }: { readonly text: string; readonly label?: string }) {
  const [copied, setCopied] = useState(false);
  if (text === '—') return <span>—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      {!label && <span className="truncate font-mono text-xs">{text}</span>}
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
          });
        }}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-chip bg-paper-2 px-2 text-xs font-bold hover:bg-paper-3"
      >
        {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
        {copied ? 'Copied' : (label ?? 'Copy')}
      </button>
    </span>
  );
}
