'use client';

import { PartyPopper } from 'lucide-react';
import { useState } from 'react';
import type { CharacterSnapshotDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, EmptyState, Section, Spinner } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useGistNav } from '../../hooks/use-gist-nav';
import { useParties } from '../../hooks/use-parties';
import { HostPartySheet } from '../parties/HostPartySheet';
import { PartyCard } from '../parties/PartyCard';

/** Owambes happening now and soon — and the button to throw your own. */
export function PartiesTab({ snapshot }: { readonly snapshot: CharacterSnapshotDto }) {
  const parties = useParties();
  const now = useGameMinute(10_000);
  const openParty = useGistNav((state) => state.openParty);
  const [hosting, setHosting] = useState(false);
  const live = (parties.data ?? []).filter((party) => party.phase === 'live');
  const upcoming = (parties.data ?? []).filter((party) => party.phase === 'upcoming');

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => setHosting(true)}
        className="relative flex items-center gap-3 overflow-hidden rounded-card bg-danfo p-3.5 text-left text-ink shadow-[0_4px_0_var(--color-danfo-deep)] active:translate-y-px"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-danfo">
          <PartyPopper size={24} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="type-slogan block text-2xl uppercase">Throw an owambe</span>
          <span className="block text-sm font-bold opacity-80">Small chops to society. Get your quote first.</span>
        </span>
        <span aria-hidden className="danfo-stripes absolute inset-x-0 bottom-0 h-[9px]" />
      </button>

      {parties.isPending && (
        <div className="grid place-items-center py-10 text-text-soft">
          <Spinner />
        </div>
      )}
      {parties.isError && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm text-okada">{errorMessage(parties.error)}</p>
          <Button variant="paper" size="sm" onClick={() => void parties.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {parties.isSuccess && live.length === 0 && upcoming.length === 0 && (
        <EmptyState icon={PartyPopper} title="No owambes right now" body="Lagos is resting its legs. Throw one and be the talk of the town." />
      )}
      {live.length > 0 && (
        <Section title="Live now" aside={`${live.length}`}>
          <ul className="flex flex-col gap-2">
            {live.map((party) => (
              <li key={party.id}>
                <PartyCard party={party} now={now} onOpen={() => openParty(party.id)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {upcoming.length > 0 && (
        <Section title="Coming up">
          <ul className="flex flex-col gap-2">
            {upcoming.map((party) => (
              <li key={party.id}>
                <PartyCard party={party} now={now} onOpen={() => openParty(party.id)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {hosting && <HostPartySheet open onClose={() => setHosting(false)} snapshot={snapshot} />}
    </div>
  );
}
