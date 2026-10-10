'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Banknote, HeartPulse, Info, Receipt, Sparkles, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatGameDuration, type NotificationDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { Button, Money, Sheet } from '@/common/components';
import { gameClock } from '@/common/game/game-clock';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { cn } from '@/common/utils/cn';
import { useAwaySession } from '../hooks/use-away-session';
import { buildAwaySummary, gameMinutesAway, type AwayCategory, type AwayGroup } from '../services/away-report';
import { awayApi } from '../services/away.api';

const CATEGORY_ICON: Readonly<Record<AwayCategory, { readonly icon: LucideIcon; readonly tile: string }>> = {
  salary: { icon: Wallet, tile: 'bg-naira-soft text-naira' },
  bills: { icon: Receipt, tile: 'bg-okada-soft text-okada' },
  health: { icon: HeartPulse, tile: 'bg-okada-soft text-okada' },
  family: { icon: Users, tile: 'bg-ankara-soft text-ankara' },
  money: { icon: Banknote, tile: 'bg-naira-soft text-naira' },
  habits: { icon: AlarmClock, tile: 'bg-cobalt-soft text-cobalt' },
  events: { icon: Sparkles, tile: 'bg-danfo-soft text-[#7a5600]' },
  other: { icon: Info, tile: 'bg-paper-3 text-text-soft' },
};

const PREVIEW = 3;

function realDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return hours === 1 ? 'an hour' : `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * "While you were away": when the player returns after ≥ 5 real minutes, summarise what landed since (salary, bills,
 * health, family, events) with money in and out. Closing marks everything read.
 */
export function AwayReport() {
  const client = useQueryClient();
  const characterId = useSnapshot().data?.character.id ?? null;
  const session = useAwaySession(characterId);
  const since = session.since;

  const report = useQuery({
    queryKey: queryKeys.domain('away-report', since ?? 0),
    queryFn: () => awayApi.since(since ?? 0),
    enabled: since !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
  const summary = useMemo(() => (report.data && since !== null ? buildAwaySummary(report.data, since) : null), [report.data, since]);

  const markRead = useMutation({
    mutationFn: awayApi.markAllRead,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notifications });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });

  const open = summary !== null && summary.count > 0;
  const close = (): void => {
    gameEvents.emit('sfx', { id: 'ui-close' });
    markRead.mutate();
    session.clear();
  };

  const lagosTime = formatGameDuration(gameMinutesAway(session.awayMs, gameClock.scale));
  return (
    <Sheet
      open={open}
      onClose={close}
      title="While you were away"
      description={`You were gone ${realDuration(session.awayMs)}. In Lagos, ${lagosTime} went by.`}
      size="md"
    >
      {summary && (
        <div className="flex flex-col gap-5 pb-2">
          <AlertSlip moneyIn={summary.moneyIn} moneyOut={summary.moneyOut} />
          {summary.groups.map((group) => (
            <GroupBlock key={group.category} group={group} />
          ))}
          <Button size="lg" block onClick={close} loading={markRead.isPending}>
            Back to Lagos
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/** Money in and out, set like bank SMS alerts (only the sides that moved). */
function AlertSlip({ moneyIn, moneyOut }: { readonly moneyIn: number; readonly moneyOut: number }) {
  if (moneyIn === 0 && moneyOut === 0) return null;
  return (
    <div className={cn('grid gap-2', moneyIn > 0 && moneyOut > 0 ? 'grid-cols-2' : 'grid-cols-1')} aria-label="Money while you were away">
      {moneyIn > 0 && <Slip tag="CR" label="Credit alerts" amount={moneyIn} tone="naira" />}
      {moneyOut > 0 && <Slip tag="DR" label="Debit alerts" amount={moneyOut} tone="okada" />}
    </div>
  );
}

function Slip({ tag, label, amount, tone }: { readonly tag: string; readonly label: string; readonly amount: number; readonly tone: 'naira' | 'okada' }) {
  const styles = tone === 'naira' ? { box: 'bg-naira-soft', text: 'text-naira', chip: 'bg-naira' } : { box: 'bg-okada-soft', text: 'text-okada', chip: 'bg-okada' };
  return (
    <div className={cn('rounded-card p-3.5', styles.box)}>
      <p className={cn('flex items-center gap-1.5 text-xs font-bold', styles.text)}>
        <span className={cn('rounded-chip px-1.5 py-0.5 text-2xs text-white', styles.chip)}>{tag}</span>
        {label}
      </p>
      <p className={cn('type-figure mt-1 text-2xl', styles.text)}>
        <Money amount={amount} compact />
      </p>
    </div>
  );
}

function GroupBlock({ group }: { readonly group: AwayGroup }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_ICON[group.category];
  const Icon = meta.icon;
  const shown = expanded ? group.items : group.items.slice(0, PREVIEW);
  return (
    <section aria-label={group.label} className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className={cn('grid size-8 place-items-center rounded-full', meta.tile)}>
          <Icon size={16} aria-hidden />
        </span>
        <h3 className="type-title flex-1 text-lg">{group.label}</h3>
        {group.net !== 0 && <Money amount={group.net} compact signed className="type-figure text-sm" />}
      </div>
      <ul className="flex flex-col gap-1">
        {shown.map((item) => (
          <AwayLine key={item.id} item={item} />
        ))}
      </ul>
      {group.items.length > PREVIEW && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="self-start text-sm font-bold text-text-soft underline-offset-2 hover:underline">
          {expanded ? 'Show less' : `Show ${group.items.length - PREVIEW} more`}
        </button>
      )}
    </section>
  );
}

function AwayLine({ item }: { readonly item: NotificationDto }) {
  return (
    <li className="flex items-start gap-3 rounded-card bg-paper-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-snug">{item.title}</p>
        <p className="line-clamp-2 text-sm text-text-soft">{item.body}</p>
      </div>
      {item.amount !== undefined && item.amount !== 0 && <Money amount={item.amount} compact signed className="type-figure shrink-0 text-sm" />}
    </li>
  );
}
