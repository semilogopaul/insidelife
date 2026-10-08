import { MapPin, Users } from 'lucide-react';
import type { GameMinute, PartyDto } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { partyWhen } from './party-time';

/** One owambe in the list: live ones glow, upcoming ones show when. */
export function PartyCard({ party, now, onOpen }: { readonly party: PartyDto; readonly now: GameMinute; readonly onOpen: () => void }) {
  const live = party.phase === 'live';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'relative flex w-full flex-col gap-1.5 overflow-hidden rounded-card p-3.5 text-left',
        live ? 'bg-ink text-on-ink ring-2 ring-ankara' : 'bg-paper-2 text-text ring-1 ring-line hover:bg-paper-3',
      )}
    >
      <span className="flex items-center gap-2 text-xs font-bold">
        {live ? (
          <span className="flex items-center gap-1.5 rounded-chip bg-ankara px-2 py-0.5 text-white">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-white" />
            Live
          </span>
        ) : (
          <span className="rounded-chip bg-paper-3 px-2 py-0.5 text-text-soft">Upcoming</span>
        )}
        <span className={live ? 'text-on-ink-soft' : 'text-text-soft'}>{party.tierLabel}</span>
        {(party.isHost || party.hostIsFriend) && <span className="ml-auto rounded-chip bg-danfo px-1.5 py-0.5 text-ink">{party.isHost ? 'Yours' : 'Friend'}</span>}
      </span>
      <span className="type-title text-xl leading-tight">{party.title}</span>
      <span className={cn('flex items-center gap-1 text-sm', live ? 'text-on-ink-soft' : 'text-text-soft')}>
        <MapPin size={14} aria-hidden className="shrink-0" />
        <span className="truncate">
          {party.venueName} — {partyWhen(party, now)}
        </span>
      </span>
      <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-bold', live ? 'text-on-ink' : 'text-text')}>
        <span>Host @{party.host.handle}</span>
        <span className="flex items-center gap-1">
          <Users size={13} aria-hidden />
          {party.guestCount}/{party.capacity}
        </span>
        {party.totalSprayed > 0 && (
          <span className={live ? 'text-danfo' : 'text-naira'}>
            <Money amount={party.totalSprayed} compact /> sprayed
          </span>
        )}
      </span>
    </button>
  );
}
