'use client';

import { useReducedMotion } from 'motion/react';
import { Lock, PartyPopper } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  NIGHT_OUT_RULES,
  NIGHT_OUT_SECTIONS,
  formatNaira,
  type NightOutItemId,
  type NightOutOfferDto,
  type NightOutSection,
  type VenueDefinition,
  type VenueMomentDto,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Badge, Button, Spinner, Tabs, TextField, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { gameClock } from '@/common/game/game-clock';
import { VenueMomentBanner, useNightOut, useVenueMoments } from '@/common/night-out';
import { newIdempotencyKey } from '@/common/utils/money-input';
import { useBuyNightOut } from '../../hooks/use-night-out-buy';
import { buyBlocker, buyLabel, queueStatus, shoutoutCharsLeft, type NightOutPerson } from '../../services/night-out';
import { OfferList } from './OfferList';
import { PeoplePicker } from './PeoplePicker';

const SECTION_LABELS: Readonly<Record<NightOutSection, string>> = { bottles: 'Bottles', shoutout: 'Shoutout', experiences: 'Experiences' };

export interface NightOutPanelProps {
  readonly venue: VenueDefinition;
  /** Everyone else in the room. */
  readonly people: readonly NightOutPerson[];
  readonly me: { readonly id: string; readonly handle: string; readonly firstName: string };
  /** Cash in hand (everything here is paid in cash). */
  readonly cash: number;
  readonly section: NightOutSection;
  readonly onSectionChange: (section: NightOutSection) => void;
}

/**
 * Night out at a club or bar: send a bottle to someone in the room, buy a DJ shoutout (your name in bold on every
 * screen here, queued one at a time) or an experience everyone sees. The server prices everything and says why
 * something is off (18+, caps, the VIP section taken, the DJ's list full).
 */
export function NightOutPanel({ venue, people, me, cash, section, onSectionChange }: NightOutPanelProps) {
  const menu = useNightOut(venue.id);
  const buy = useBuyNightOut(venue.id);
  const reduceMotion = useReducedMotion() ?? false;
  const [picked, setPicked] = useState<Partial<Record<NightOutSection, NightOutItemId>>>({});
  const [target, setTarget] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const data = menu.data;
  const offers = (data?.offers ?? []).filter((offer) => offer.section === section);
  const offer = offers.find((candidate) => candidate.id === picked[section]) ?? offers.find((candidate) => candidate.unavailable === null) ?? offers[0] ?? null;
  // People can leave while the panel is open: a target who left falls back to nobody (or "me" for a birthday).
  const person = people.find((candidate) => candidate.handle === target) ?? null;
  const needsTarget = offer?.target === 'required' || offer?.target === 'optional';
  const blocker = buyBlocker(offer, cash, offer?.target === 'none' ? null : person, data?.closedReason ?? null);

  const submit = (): void => {
    if (!offer || blocker) return;
    gameEvents.emit('sfx', { id: 'cash-out' });
    buy.mutate(
      {
        itemId: offer.id,
        toHandle: needsTarget ? (person?.handle ?? null) : null,
        message: offer.kind === 'shoutout' ? message.trim() || null : null,
        idempotencyKey: newIdempotencyKey(),
      },
      {
        onSuccess: (result) => {
          gameEvents.emit('sfx', { id: 'celebration' });
          if (offer.kind === 'shoutout') setMessage('');
          toast({ title: successTitle(offer, person, result.queueAhead), body: result.cloutGained > 0 ? `+${result.cloutGained} clout` : undefined, tone: 'good', amount: -result.price });
        },
        onError: (error) => {
          gameEvents.emit('sfx', { id: 'ui-error' });
          toast({ title: 'The waiter came back', body: errorMessage(error), tone: 'bad' });
        },
      },
    );
  };

  return (
    <section aria-label={`Night out at ${venue.name}`} className="flex flex-col gap-3 rounded-card bg-paper-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="type-title flex items-center gap-2 text-lg">
            <PartyPopper size={20} aria-hidden className="shrink-0 text-ankara" />
            <span className="truncate">Night out at {venue.name}</span>
          </h3>
          <p className="text-xs text-text-soft">
            {data ? `${data.you.momentsTonight} of ${NIGHT_OUT_RULES.maxMomentsPerNight} tonight · nights reset at 6am` : 'Bottles, shoutouts and moments the whole room sees.'}
          </p>
        </div>
        <Badge tone="warn">18+</Badge>
      </div>

      {data?.closedReason && (
        <p role="alert" className="flex gap-2 rounded-card bg-okada-soft p-2.5 text-sm font-bold text-okada">
          <Lock size={16} aria-hidden className="mt-0.5 shrink-0" />
          {data.closedReason}
        </p>
      )}

      <Tabs<NightOutSection> label="Night out" value={section} onChange={onSectionChange} items={NIGHT_OUT_SECTIONS.map((id) => ({ id, label: SECTION_LABELS[id] }))} />

      {menu.isPending && <Spinner className="self-center text-text-soft" />}
      {menu.isError && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-okada">{errorMessage(menu.error)}</p>
          <Button size="sm" variant="paper" onClick={() => void menu.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {data && (
        <div role="tabpanel" aria-label={SECTION_LABELS[section]} className="flex flex-col gap-3">
          {section === 'bottles' && (
            <PeoplePicker label="Send to" people={people} selected={person?.handle ?? null} onSelect={setTarget} empty="Nobody else is here yet. Bottles are for someone in the room (18+)." />
          )}
          {section === 'shoutout' && (
            <ShoutoutComposer me={me} offer={offer} message={message} onMessage={setMessage} reduceMotion={reduceMotion} />
          )}
          <OfferList label={`${SECTION_LABELS[section]} menu`} offers={offers} selected={offer?.id ?? null} cash={cash} onSelect={(id) => setPicked((current) => ({ ...current, [section]: id }))} />
          {section === 'experiences' && offer?.target === 'optional' && (
            <PeoplePicker label="Whose birthday?" people={people} selected={person?.handle ?? null} onSelect={setTarget} allowMe empty="Just you here — it’s your birthday then." />
          )}

          <div className="sticky bottom-2 flex flex-col gap-1.5 rounded-card bg-paper-2/95 pt-1">
            <Button block size="lg" loading={buy.isPending} disabled={blocker !== null} onClick={submit} aria-describedby="night-out-why">
              {offer ? buyLabel(offer, offer.target === 'none' ? null : person) : 'Pick something'}
            </Button>
            <p id="night-out-why" aria-live="polite" className="text-center text-xs text-text-soft">
              {blocker ?? `Paid from your cash (${formatNaira(cash)}). The money goes to the club — it isn’t a transfer.`}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function successTitle(offer: NightOutOfferDto, person: NightOutPerson | null, queueAhead: number): string {
  if (offer.kind === 'bottle') return `${offer.emoji} On its way to ${person?.firstName ?? 'them'}`;
  if (offer.kind === 'shoutout') return queueAhead === 0 ? '🎤 You’re next on the mic' : `🎤 You’re on the DJ’s list — ${queueAhead} ahead of you`;
  return `${offer.emoji} ${offer.label}: the whole room saw it`;
}

/** Message, live preview of what the room will see, and where you are in the DJ's queue. */
function ShoutoutComposer({
  me,
  offer,
  message,
  onMessage,
  reduceMotion,
}: {
  readonly me: NightOutPanelProps['me'];
  readonly offer: NightOutOfferDto | null;
  readonly message: string;
  readonly onMessage: (message: string) => void;
  readonly reduceMotion: boolean;
}) {
  const mine = useVenueMoments((state) => state.moments.find((moment) => moment.kind === 'shoutout' && moment.from.characterId === me.id) ?? null);
  const left = shoutoutCharsLeft(message);
  return (
    <div className="flex flex-col gap-2.5">
      {mine && <QueueLine moment={mine} />}
      <div aria-hidden className="grid place-items-center rounded-card bg-ink px-2 py-3">
        <VenueMomentBanner
          variant="headline"
          reducedMotion={reduceMotion}
          moment={{
            kind: 'shoutout',
            tier: offer?.id ?? 'shoutout-basic',
            from: { characterId: me.id, handle: me.handle, firstName: me.firstName },
            to: null,
            label: offer?.label ?? 'Shoutout',
            emoji: offer?.emoji ?? '🎤',
            message: message.trim() || 'The DJ picks a line for you',
          }}
        />
      </div>
      <TextField
        label="Your message"
        value={message}
        maxLength={NIGHT_OUT_RULES.shoutoutMaxLength}
        placeholder="Birthday babe in the building!"
        onChange={(event) => onMessage(event.target.value)}
        hint={`${left} characters left. No links, phone numbers or bad words — the DJ won’t say them.`}
        trailing={<span className="tabular text-xs text-text-faint">{left}</span>}
      />
    </div>
  );
}

/** "You're next: in ~40s" → "On screen now" for your queued shoutout (ticks each second). */
function QueueLine({ moment }: { readonly moment: VenueMomentDto }) {
  const [now, setNow] = useState(() => gameClock.serverNow());
  const status = queueStatus(moment.startsAt, moment.durationMs, now);
  useEffect(() => {
    if (status.state === 'done') return;
    const id = window.setInterval(() => setNow(gameClock.serverNow()), 1_000);
    return () => window.clearInterval(id);
  }, [status.state]);
  return (
    <p role="status" className={status.state === 'live' ? 'rounded-card bg-danfo p-2.5 text-center text-sm font-bold text-ink' : 'rounded-card bg-paper p-2.5 text-center text-sm font-bold ring-1 ring-line'}>
      {status.text}
    </p>
  );
}
