'use client';

import { useId } from 'react';
import {
  HOST_TREAT_KIND_LABELS,
  HOST_TREAT_KINDS,
  type HostTreatId,
  type HostTreatOfferDto,
  type HostingDto,
} from '@insidelife/shared';
import { Badge, Button, Money } from '@/common/components';

export interface HostMenuProps {
  readonly hosting: HostingDto;
  /** Cash in hand (the server checks again). */
  readonly cash: number;
  /** The treat being served right now (its button spins). */
  readonly serving: HostTreatId | null;
  readonly onServe: (treatId: HostTreatId) => void;
}

/** "for you and 2 guests", "for 2 guests", "for the room". */
export function servingLabel(offer: Pick<HostTreatOfferDto, 'per'>, guests: number): string {
  if (offer.per === 'once') return 'for the room';
  const people = `${guests} guest${guests === 1 ? '' : 's'}`;
  return offer.per === 'everyone' ? `for you and ${people}` : `for ${people}`;
}

/** "Tolu", "Tolu and Kemi", "Tolu, Kemi and Ade". */
function names(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

/**
 * The host's menu while guests are in: food from the pantry, food ordered in, drinks, cake and things to take home,
 * priced for everyone inside. Presentational; `HostSheet` fetches and serves.
 */
export function HostMenu({ hosting, cash, serving, onServe }: HostMenuProps) {
  const guests = hosting.guests.map((guest) => guest.person.firstName);
  if (!hosting.atHome || guests.length === 0) {
    return (
      <p className="rounded-card bg-paper-2 p-4 text-center text-sm text-text-soft">
        {hosting.atHome
          ? 'Nobody’s inside yet. Treats are for guests who’ve come in.'
          : 'You’re not at home. Hosting happens in your own house.'}
      </p>
    );
  }
  const onTable = new Set(hosting.active.map((treat) => treat.treatId));
  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-card bg-naira-soft p-3 text-sm">
        <strong>{names(guests)}</strong> {guests.length === 1 ? 'is' : 'are'} in. Whatever you serve goes on
        the table for everyone to see.
      </p>
      {HOST_TREAT_KINDS.map((kind) => {
        const offers = hosting.menu.filter((offer) => offer.kind === kind);
        if (offers.length === 0) return null;
        return (
          <section key={kind} aria-label={HOST_TREAT_KIND_LABELS[kind]} className="flex flex-col gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-text-soft">
              {HOST_TREAT_KIND_LABELS[kind]}
            </h4>
            <ul className="flex flex-col gap-2">
              {offers.map((offer) => (
                <TreatRow
                  key={offer.id}
                  offer={offer}
                  guests={guests.length}
                  onTable={onTable.has(offer.id)}
                  cash={cash}
                  busy={serving === offer.id}
                  disabled={serving !== null}
                  pantryMeals={hosting.pantryMeals}
                  onServe={() => onServe(offer.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TreatRow({
  offer,
  guests,
  onTable,
  cash,
  busy,
  disabled,
  pantryMeals,
  onServe,
}: {
  readonly offer: HostTreatOfferDto;
  readonly guests: number;
  readonly onTable: boolean;
  readonly cash: number;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly pantryMeals: number;
  readonly onServe: () => void;
}) {
  const reasonId = useId();
  const reason = offer.unavailable ?? (offer.total > cash ? 'Not enough cash on you' : null);
  const fromPantry = offer.pantryMeals > 0;
  return (
    <li className="flex flex-col gap-2 rounded-card bg-paper-2 p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-card bg-paper text-2xl">
          {offer.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-bold leading-tight">
            {offer.name}
            {offer.adultsOnly && <Badge tone="warn">18+</Badge>}
            {onTable && <Badge tone="good">On the table</Badge>}
          </p>
          <p className="mt-0.5 text-sm text-text-soft">{offer.blurb}</p>
          <p className="mt-1 text-xs font-bold text-text-soft">
            {fromPantry ? (
              `${offer.pantryMeals} pantry meal${offer.pantryMeals === 1 ? '' : 's'} (you have ${pantryMeals})`
            ) : (
              <Money amount={offer.unitPrice} />
            )}
            {!fromPantry && offer.per !== 'once' && ' each'} · {servingLabel(offer, guests)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {reason ? (
          <p id={reasonId} className="text-xs text-text-soft">
            {reason}
          </p>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant="ink"
          loading={busy}
          disabled={disabled || reason !== null}
          aria-describedby={reason ? reasonId : undefined}
          onClick={onServe}
        >
          {fromPantry ? (
            'Cook for them'
          ) : (
            <>
              Serve · <Money amount={offer.total} compact />
            </>
          )}
        </Button>
      </div>
    </li>
  );
}
