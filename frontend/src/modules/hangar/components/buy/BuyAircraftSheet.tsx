'use client';

import { useState } from 'react';
import {
  DEFAULT_LIVERY,
  FERRY_DELIVERY_DAYS,
  GAT_IDS,
  normaliseAircraftName,
  type AircraftCatalogEntryDto,
  type GatId,
} from '@insidelife/shared';
import { HoldButton, Money, Receipt, Sheet, TextField } from '@/common/components';
import { announce, complain } from '@/common/game/feedback';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { cn } from '@/common/utils/cn';
import { useHangarCommands } from '../../hooks/use-hangar';
import {
  NAME_MAX,
  airframeFor,
  gatName,
  liveryHex,
  nameProblem,
  purchaseLines,
  purchaseTotal,
  registrationDraft,
  registrationFull,
  registrationProblem,
} from '../../services/hangar-rules';
import { AircraftArt } from '../AircraftArt';
import { LiverySwatches } from '../LiverySwatches';

/** Buy at the sales desk (parked here today) or order a ferry flight to a terminal of your choice. */
export function BuyAircraftSheet({ entry, onClose }: { readonly entry: AircraftCatalogEntryDto | null; readonly onClose: () => void }) {
  return (
    <Sheet open={entry !== null} onClose={onClose} title={entry?.aircraft.name ?? ''} description={entry ? 'Pick your colours, name and registration.' : undefined}>
      {entry && <BuyForm key={entry.aircraft.id} entry={entry} onClose={onClose} />}
    </Sheet>
  );
}

function BuyForm({ entry, onClose }: { readonly entry: AircraftCatalogEntryDto; readonly onClose: () => void }) {
  const { purchase } = useHangarCommands();
  const { data: snapshot } = useSnapshot();
  const [base, setBase] = useState(DEFAULT_LIVERY.base);
  const [accent, setAccent] = useState(DEFAULT_LIVERY.accent);
  const [name, setName] = useState('');
  const [registration, setRegistration] = useState('');
  const [deliverTo, setDeliverTo] = useState<GatId>('mmia-gat');
  const inPerson = entry.buyHere;
  const total = purchaseTotal(entry, inPerson);
  const short = snapshot ? total - snapshot.wallet.balance : 0;
  const nameIssue = nameProblem(name);
  const registrationIssue = registrationProblem(registration);
  const blocked = short > 0 || nameIssue !== null || registrationIssue !== null || purchase.isPending;

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="rounded-card bg-paper-2 px-3 py-4">
        <AircraftArt
          airframe={airframeFor(entry.aircraft.class)}
          base={liveryHex(base)}
          accent={liveryHex(accent)}
          name={normaliseAircraftName(name)}
          registration={registrationFull(registration) ?? undefined}
          label={`${entry.aircraft.name} in your colours`}
        />
      </div>
      <LiverySwatches label="Base colour" value={base} onChange={setBase} />
      <LiverySwatches label="Accent colour" value={accent} onChange={setAccent} />
      <TextField
        label="Name on the fuselage (optional)"
        value={name}
        maxLength={NAME_MAX}
        onChange={(event) => setName(event.target.value)}
        error={nameIssue}
        hint={`Up to ${NAME_MAX} letters, digits and spaces, like “Air Tolu”.`}
        autoComplete="off"
      />
      <TextField
        label="Registration (optional)"
        value={registration}
        onChange={(event) => setRegistration(registrationDraft(event.target.value))}
        error={registrationIssue}
        hint="5N- and three letters. Leave blank for a random one; each registration is unique in the world."
        placeholder="TOL"
        autoComplete="off"
        autoCapitalize="characters"
      />
      {!inPerson && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-bold">Deliver to</legend>
          <div className="flex gap-2">
            {GAT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={deliverTo === id}
                onClick={() => setDeliverTo(id)}
                className={cn(
                  'flex-1 rounded-card px-3 py-2 text-left text-sm font-bold ring-1 transition',
                  deliverTo === id ? 'bg-ink text-on-ink ring-ink' : 'bg-paper-2 ring-line hover:bg-paper-3',
                )}
              >
                {gatName(id)}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-soft">The ferry crew flies it over; it lands in {FERRY_DELIVERY_DAYS} game days. Buy at the Lagos GAT sales desk to skip the fee.</p>
        </fieldset>
      )}
      <Receipt
        lines={purchaseLines(entry, inPerson, deliverTo)}
        total={{ label: inPerson ? 'Pay at the desk' : 'Pay now', amount: total }}
        caption={
          inPerson
            ? 'You’re at the sales desk: it is parked on the apron today.'
            : `Hangar, maintenance${entry.monthly.crew > 0 ? ' and crew' : ''} come to about ${Math.round(entry.monthly.total / 1000).toLocaleString('en-NG')}k a month.`
        }
      />
      {short > 0 && (
        <p className="text-sm font-bold text-okada">
          You’re short by <Money amount={short} />.
        </p>
      )}
      <HoldButton
        disabled={blocked}
        onConfirm={() =>
          purchase.mutate(
            {
              aircraftId: entry.aircraft.id,
              deliverTo: inPerson ? undefined : deliverTo,
              name: name.trim() === '' ? undefined : name,
              registration: registration === '' ? undefined : registration,
              liveryBase: base,
              liveryAccent: accent,
            },
            {
              onSuccess: (result) => {
                gameEvents.emit('celebrate', { kind: 'milestone', title: 'Aircraft owner!', body: `${result.aircraft.name} · ${result.aircraft.registration}` });
                announce(result.channel === 'in-person' ? 'Keys in hand 🔑' : 'Aircraft ordered', {
                  body:
                    result.channel === 'in-person'
                      ? `${result.aircraft.registration} is on the apron at ${gatName(result.aircraft.parkedAt)}.`
                      : `A ferry crew brings ${result.aircraft.registration} to ${gatName(result.aircraft.parkedAt)}.`,
                  amount: -(result.price + result.ferryFee),
                });
                onClose();
              },
              onError: (error) => complain('Purchase didn’t go through', error),
            },
          )
        }
      >
        Hold to {inPerson ? 'buy' : 'order'} · <Money amount={total} compact />
      </HoldButton>
    </div>
  );
}
