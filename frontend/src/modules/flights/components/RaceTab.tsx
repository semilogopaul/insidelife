'use client';

import { Flag, Medal, Timer, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import { getCity, type RaceDto, type RaceFriendDto, type RacesOverviewDto } from '@insidelife/shared';
import { Badge, Button, EmptyState, ErrorState, LoadingRows } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { useGameMinute } from '@/common/game/use-game-clock';
import { cn } from '@/common/utils/cn';
import { useRaceAction, useRacesOverview } from '../hooks/use-races';
import { raceChip, raceClock, raceDeepLink, raceRoute, racerLine } from '../services/race-format';

/** Races you are in or were in: the card shows each racer's time, how they travelled and their place. */
export function RaceCard({ race, now, children }: { readonly race: RaceDto; readonly now: number; readonly children?: React.ReactNode }) {
  const chip = raceChip(race, now);
  const clock = raceClock(race, now);
  const ordered = race.racers.toSorted((a, b) => (a.place ?? 99) - (b.place ?? 99) || Number(b.isYou) - Number(a.isYou));
  return (
    <li className="flex flex-col gap-3 rounded-card bg-paper-2 p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-full bg-ink text-gold">
          <Flag size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{raceRoute(race)}</p>
          {clock && <p className="text-xs text-text-soft">{clock}</p>}
        </div>
        <Badge tone={chip.tone}>{chip.label}</Badge>
      </div>
      <ul className="flex flex-col gap-1.5" aria-label={`Racers, ${raceRoute(race)}`}>
        {ordered.map((racer) => (
          <li key={racer.characterId} className={cn('flex items-center gap-2 rounded-chip px-2.5 py-1.5', racer.isYou ? 'bg-paper' : 'bg-paper/60')}>
            {racer.winner ? <Trophy size={16} className="shrink-0 text-gold" aria-label="Winner" /> : racer.place !== null ? <Medal size={16} aria-hidden className="shrink-0 text-text-soft" /> : <Timer size={16} aria-hidden className="shrink-0 text-text-faint" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {racer.isYou ? 'You' : racer.name}
                {racer.isChallenger && !racer.isYou ? <span className="font-normal text-text-soft"> · challenger</span> : null}
              </p>
              <p className="truncate text-xs text-text-soft">{racerLine(race, racer, now)}</p>
            </div>
          </li>
        ))}
      </ul>
      {children}
    </li>
  );
}

function Invitations({ overview, now }: { readonly overview: RacesOverviewDto; readonly now: number }) {
  const action = useRaceAction();
  const racing = overview.active !== null;
  if (overview.invitations.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Challenges for you">
      <h3 className="type-title text-lg">Challenges</h3>
      <ul className="flex flex-col gap-3">
        {overview.invitations.map((race) => {
          const challenger = race.racers.find((racer) => racer.isChallenger);
          return (
            <RaceCard key={race.id} race={race} now={now}>
              <p className="text-sm text-text-soft">{challenger?.name ?? 'A friend'} wants a race. The clock starts when everyone is in, and everyone has to be in {getCity(race.fromCity).name}.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="danfo" size="sm" disabled={racing || action.isPending} onClick={() => action.mutate({ kind: 'accept', raceId: race.id })}>
                  I’m in
                </Button>
                <Button variant="paper" size="sm" disabled={action.isPending} onClick={() => action.mutate({ kind: 'decline', raceId: race.id })}>
                  No thanks
                </Button>
              </div>
              {racing && <p className="text-xs text-text-soft">Finish your own race first.</p>}
            </RaceCard>
          );
        })}
      </ul>
    </section>
  );
}

function Challenge({ overview, preselect }: { readonly overview: RacesOverviewDto; readonly preselect: string | null }) {
  const action = useRaceAction();
  const [picked, setPicked] = useState<readonly string[]>(() => {
    const friend = overview.friends.find((candidate) => candidate.characterId === preselect);
    return friend?.available ? [friend.characterId] : [];
  });
  const destination = getCity(overview.toCity).name;
  const limit = overview.maxRacers - 1;
  const toggle = (friend: RaceFriendDto): void => {
    if (!friend.available) return;
    setPicked((current) => (current.includes(friend.characterId) ? current.filter((id) => id !== friend.characterId) : current.length < limit ? [...current, friend.characterId] : current));
  };

  if (overview.friends.length === 0) {
    return <EmptyState icon={Users} title="No friends to race yet" body="Add friends from a player’s profile in Gist, then challenge them here." />;
  }
  return (
    <section className="flex flex-col gap-3 rounded-card bg-paper-2 p-3" aria-label="Start a race">
      <div>
        <h3 className="type-title text-lg">Race a friend to {destination}</h3>
        <p className="text-sm text-text-soft">
          Pick up to {limit} friends in {getCity(overview.cityId).name}. First to {destination} wins: your own plane, an airline seat or the coach. No money on it.
        </p>
      </div>
      <ul className="flex flex-col gap-1.5" aria-label="Friends">
        {overview.friends.map((friend) => {
          const on = picked.includes(friend.characterId);
          return (
            <li key={friend.characterId}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!friend.available}
                onClick={() => toggle(friend)}
                className={cn(
                  'flex min-h-12 w-full items-center gap-3 rounded-card px-3 text-left transition-colors disabled:opacity-60',
                  on ? 'bg-ink text-on-ink' : 'bg-paper hover:bg-paper-3',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{friend.name}</span>
                  <span className={cn('block truncate text-xs', on ? 'text-on-ink-soft' : 'text-text-soft')}>@{friend.handle}</span>
                </span>
                {friend.reason ? <Badge tone="neutral">{friend.reason}</Badge> : on ? <Badge tone="good">Picked</Badge> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <Button
        variant="danfo"
        size="lg"
        block
        loading={action.isPending}
        disabled={!overview.canChallenge || picked.length === 0}
        onClick={() => action.mutate({ kind: 'create', friendIds: picked }, { onSuccess: () => setPicked([]) })}
      >
        Challenge {picked.length > 0 ? `${picked.length} friend${picked.length > 1 ? 's' : ''}` : 'friends'} to {destination}
      </Button>
      {overview.blocker && <p className="text-sm font-bold text-okada">{overview.blocker}</p>}
    </section>
  );
}

/** The Race tab of the Flights app: your race, challenges for you, who you can challenge and how past races ended. */
export function RaceTab() {
  const overview = useRacesOverview();
  const now = useGameMinute(5_000);
  const action = useRaceAction();
  const preselect = raceDeepLink(useUi((state) => state.phoneParam)).friendId;
  const data = overview.data;

  if (overview.isPending) return <LoadingRows label="Loading races" />;
  if (overview.isError || !data) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;

  const { active } = data;
  const challenger = active?.racers.find((racer) => racer.isYou)?.isChallenger ?? false;
  return (
    <div className="flex flex-col gap-4">
      {active && (
        <section className="flex flex-col gap-2" aria-label="Your race">
          <h3 className="type-title text-lg">Your race</h3>
          <ul>
            <RaceCard race={active} now={now}>
              {active.status === 'pending' ? (
                <p className="text-sm text-text-soft">Waiting for everyone to say yes. The clock starts with the last one, and nobody can have left {getCity(active.fromCity).name}.</p>
              ) : (
                <p className="text-sm text-text-soft">
                  Get to {getCity(active.toCity).name} before the others: fly your plane, book an airline seat or take the coach.
                </p>
              )}
              {active.status === 'pending' && challenger && (
                <Button variant="paper" size="sm" disabled={action.isPending} onClick={() => action.mutate({ kind: 'cancel', raceId: active.id })}>
                  Call it off
                </Button>
              )}
            </RaceCard>
          </ul>
        </section>
      )}
      <Invitations overview={data} now={now} />
      {!active && <Challenge key={data.friends.map((friend) => friend.characterId).join(',')} overview={data} preselect={preselect} />}
      {data.recent.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Past races">
          <h3 className="type-title text-lg">Results</h3>
          <ul className="flex flex-col gap-3">
            {data.recent.map((race) => (
              <RaceCard key={race.id} race={race} now={now} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
