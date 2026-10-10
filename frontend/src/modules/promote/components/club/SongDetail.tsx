'use client';

import { CalendarDays, Disc3, Headphones, Lock, MapPin, Music2, Repeat } from 'lucide-react';
import { useState } from 'react';
import { findVenue, runLengthLabel, type ClubPlayTimeDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Section, Spinner, StatTile, TakeMeThere } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useNow } from '@/common/hooks/use-now';
import { useClubOrderDetail } from '../../hooks/use-promote';
import { playTimeLabels } from '../../services/play-times';
import { formatDuration, formatRunDays } from '../../services/rules';
import { audienceLine } from '../../services/song-value';
import { STATUS_META } from '../../services/status';
import { PendingPayment } from '../detail/PendingPayment';
import { ReceiptCard } from '../detail/ReceiptCard';
import { Timeline } from '../detail/Timeline';
import { StatusBadge, StepHeader } from '../shared';

const RERUNNABLE = new Set(['completed', 'refunded', 'rejected', 'cancelled', 'refund-due']);

export interface SongDetailProps {
  readonly orderId: string;
  /** Opened from "your song is on at …": show the way to that club straight away. */
  readonly goToVenueId?: string | null;
  readonly onBack: () => void;
  /** "Run it again": book the same song again at today's price. */
  readonly onRunAgain: (trackId: string) => void;
}

/**
 * A song's run: the song (listen), the clubs and dates, what happened to it, the receipt, how many plays and who heard
 * them (per club), and exactly when it plays next, in local time and game time, with a way to the club playing it next.
 */
export function SongDetail({ orderId, goToVenueId = null, onBack, onRunAgain }: SongDetailProps) {
  const detail = useClubOrderDetail(orderId);
  const now = useNow();
  const clout = useSnapshot().data?.character.status ?? 0;
  const [going, setGoing] = useState<string | null>(goToVenueId);

  if (detail.isPending || detail.isError) {
    return (
      <div className="flex flex-col gap-4">
        <StepHeader title="Your song" onBack={onBack} backLabel="Back to Club DJ" />
        {detail.isPending ? (
          <Spinner className="mx-auto my-10 block text-text-soft" />
        ) : (
          <div className="rounded-card bg-okada-soft p-4 text-sm">
            <p className="text-okada">{errorMessage(detail.error)}</p>
            <Button variant="paper" size="sm" className="mt-2" onClick={() => void detail.refetch()}>
              Try again
            </Button>
          </div>
        )}
      </div>
    );
  }

  const { order, track, timeline, receipt, guarantee, byClub, playingNow, upcoming } = detail.data;
  const meta = STATUS_META[order.status];
  const running = order.status === 'live' || order.status === 'approved';
  const plays: readonly ClubPlayTimeDto[] = playingNow ? [playingNow, ...upcoming] : upcoming;
  // The next play at a club the player can get into (clout gates), else simply the next one.
  const next = plays.find((play) => (findVenue(play.venueId)?.minStatus ?? 0) <= clout) ?? plays[0] ?? null;
  const goingTo = going ? findVenue(going) : undefined;

  return (
    <div className="flex flex-col gap-5 pb-2">
      <StepHeader title={track.title} onBack={onBack} backLabel="Back to Club DJ" aside={<StatusBadge status={order.status} />} />

      <div className="flex items-center gap-3 rounded-sheet bg-ink p-4 text-on-ink">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-danfo text-ink">
          <Disc3 size={24} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{track.title}</p>
          <p className="truncate text-sm text-on-ink-soft">
            {track.artistName} · {formatDuration(track.durationSeconds)}
          </p>
        </div>
      </div>
      {!track.removed && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
            <Headphones size={15} aria-hidden /> Listen
          </p>
          <audio controls preload="none" src={track.audioUrl} className="h-10 w-full" aria-label={`${track.title} by ${track.artistName}`}>
            <track kind="captions" />
          </audio>
        </div>
      )}
      <p className="-mt-2 text-sm text-text-soft">{order.rejectionReason ? `Moderator: “${order.rejectionReason}”` : meta.next}</p>

      <dl className="grid gap-2.5 text-sm">
        <div className="flex gap-2.5">
          <dt className="sr-only">Where</dt>
          <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-lagoon" />
          <dd>
            <span className="font-bold">Every club and lounge in Lagos ({guarantee.clubs})</span>
            <span className="block text-text-soft">
              ≈ {guarantee.playsPerDay.toLocaleString('en-NG')} plays a day, never under {guarantee.minPlaysPerDay.toLocaleString('en-NG')}, while they’re open
            </span>
          </dd>
        </div>
        <div className="flex gap-2.5">
          <dt className="sr-only">When</dt>
          <CalendarDays size={18} aria-hidden className="mt-0.5 shrink-0 text-lagoon" />
          <dd>
            <span className="font-bold">{formatRunDays(order.startDate, order.endDate)}</span>
            <span className="block text-text-soft">{runLengthLabel(order.days)}, whole days Lagos time</span>
          </dd>
        </div>
      </dl>

      {(order.plays > 0 || running) && (
        <Section title="Plays and listeners">
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Plays" value={order.plays.toLocaleString('en-NG')} />
            <StatTile label="Players heard it" value={order.listeners.toLocaleString('en-NG')} />
            <StatTile label="Total audience" value={order.audience.toLocaleString('en-NG')} />
          </div>
          <p className="mt-2 text-sm">{audienceLine(order.plays, order.listeners)}</p>
          {order.plays > 0 && (
            <ul className="mt-2 flex flex-col divide-y divide-line rounded-card bg-paper-2 px-3 text-sm" aria-label="Plays by club">
              {byClub
                .filter((club) => club.plays > 0)
                .map((club) => (
                  <li key={club.venueId} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate">{findVenue(club.venueId)?.name ?? club.venueId}</span>
                    <span className="shrink-0 text-xs text-text-soft">
                      {club.plays} {club.plays === 1 ? 'play' : 'plays'} · {club.audience} heard
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Section>
      )}

      {running && (
        <Section title="When it plays next">
          {plays.length === 0 ? (
            <p className="text-sm text-text-soft">{order.status === 'approved' ? 'Plays start on its first day.' : 'No more plays in this run.'}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-line rounded-card ring-1 ring-line">
              {plays.map((play) => {
                const labels = playTimeLabels(play, now);
                const venue = findVenue(play.venueId);
                const locked = (venue?.minStatus ?? 0) > 0;
                return (
                  <li key={`${play.venueId}-${play.startsAtMs}`} className="flex items-center gap-3 px-3 py-2.5">
                    <Music2 size={18} aria-hidden className={labels.playing ? 'shrink-0 text-naira' : 'shrink-0 text-text-faint'} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{venue?.name ?? play.venueId}</p>
                      <p className="text-xs text-text-soft">
                        <span className={labels.playing ? 'font-bold text-naira' : ''}>{labels.relative}</span> · {labels.real} · {labels.game} game time
                        {locked && (
                          <span className="ml-1 inline-flex items-center gap-0.5">
                            <Lock size={11} aria-hidden /> {venue?.minStatus} clout to get in
                          </span>
                        )}
                      </p>
                    </div>
                    <Button size="sm" variant={going === play.venueId ? 'ink' : 'paper'} onClick={() => setGoing(going === play.venueId ? null : play.venueId)} aria-expanded={going === play.venueId}>
                      Go
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
          {next && !going && (
            <Button className="mt-2" block onClick={() => setGoing(next.venueId)}>
              Take me to the club playing it next
            </Button>
          )}
          {goingTo && (
            <div className="mt-3 rounded-card bg-paper-2 p-3">
              <p className="mb-2 text-sm font-bold">Take me to {goingTo.name}</p>
              <TakeMeThere destinationId={goingTo.id} destinationName={goingTo.name} rideVenueId={goingTo.id} rideVenueName={goingTo.name} />
            </div>
          )}
        </Section>
      )}

      <Section title="What happened">
        <Timeline steps={timeline} />
      </Section>

      {order.status === 'pending-payment' && <PendingPayment paymentReference={order.paymentReference} checkoutUrl={order.checkoutUrl} holdExpiresAt={order.holdExpiresAt} />}

      <Section title="Receipt">
        <ReceiptCard receipt={receipt} />
      </Section>

      {RERUNNABLE.has(order.status) && !track.removed && (
        <div className="sticky bottom-0 -mx-1 bg-paper px-1 pb-1 pt-2">
          <Button size="lg" block variant="danfo" icon={<Repeat size={18} aria-hidden />} onClick={() => onRunAgain(track.id)}>
            Run it again
          </Button>
          <p className="mt-1.5 text-center text-xs text-text-soft">A new booking at today’s price, from the rotation’s next free day.</p>
        </div>
      )}
    </div>
  );
}
