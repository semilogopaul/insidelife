'use client';

import { Paintbrush, PlaneTakeoff } from 'lucide-react';
import { useState } from 'react';
import { MAX_AIRCRAFT, deliveryByLabel, type GameMinute, type HangarDto, type OwnedAircraftDto } from '@insidelife/shared';
import { Badge, Button, ConfirmSheet, Money, NextStep } from '@/common/components';
import { announce, complain } from '@/common/game/feedback';
import { useHangarCommands } from '../../hooks/use-hangar';
import { airframeFor, gatName, liveryHex, sortFleet } from '../../services/hangar-rules';
import { AircraftArt } from '../AircraftArt';
import { FlySheet } from './FlySheet';
import { MakeItYoursSheet } from './MakeItYoursSheet';

type Pending = { readonly kind: 'sell' | 'reinstate'; readonly plane: OwnedAircraftDto } | null;

/** Your aircraft: where each is parked, livery and name, running costs, flying and selling. */
export function FleetTab({ data, now, onShop }: { readonly data: HangarDto; readonly now: GameMinute; readonly onShop: () => void }) {
  const { sell, reinstate } = useHangarCommands();
  const [pending, setPending] = useState<Pending>(null);
  const [flying, setFlying] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const flyingPlane = data.mine.find((plane) => plane.id === flying) ?? null;
  const editingPlane = data.mine.find((plane) => plane.id === editing) ?? null;

  if (data.mine.length === 0) {
    return (
      <NextStep
        title="Get your wings"
        body={
          <>
            The cheapest aircraft starts around{' '}
            {data.catalogue[0] ? <Money amount={data.catalogue[0].price} compact className="font-bold text-on-ink" /> : 'two hundred million'} — a used Cessna 172. Propeller planes need a
            pilot’s licence from the flight school; jets come with a hired crew.
          </>
        }
        actions={<Button onClick={onShop}>Browse aircraft</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-soft">
        {data.mine.length} of {MAX_AIRCRAFT} hangar spaces. Hangar, maintenance and crew are charged at month end; unpaid bills ground the aircraft.
      </p>
      <ul className="flex flex-col gap-3">
        {sortFleet(data.mine).map((plane) => (
          <li key={plane.id} className="flex flex-col gap-3 rounded-card bg-paper-2 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="type-title truncate text-lg leading-tight">{plane.callName ?? plane.name}</p>
                <p className="truncate text-sm text-text-soft">
                  {plane.callName ? `${plane.name} · ` : ''}
                  {plane.registration}
                </p>
              </div>
              <Badge tone={plane.grounded ? 'bad' : plane.airborne ? 'info' : 'good'}>
                {plane.grounded ? 'Grounded' : plane.airborne ? 'In the air' : 'Ready'}
              </Badge>
            </div>
            <AircraftArt
              airframe={airframeFor(plane.aircraftClass)}
              base={liveryHex(plane.liveryBase)}
              accent={liveryHex(plane.liveryAccent)}
              name={plane.callName ?? undefined}
              registration={plane.registration}
              label={`${plane.name} ${plane.registration}`}
              className="mx-auto w-full max-w-xs"
            />
            <p className="text-sm">
              {plane.airborne && plane.arrivesAt !== null ? (
                <>
                  Landing at <strong>{gatName(plane.parkedAt)}</strong> {deliveryByLabel(plane.arrivesAt, now)}.
                </>
              ) : (
                <>
                  Parked at <strong>{gatName(plane.parkedAt)}</strong>.
                </>
              )}
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-text-soft">Worth today</dt>
              <dd className="text-right font-bold"><Money amount={plane.value} compact /></dd>
              <dt className="text-text-soft">Running cost / month</dt>
              <dd className="text-right font-bold"><Money amount={plane.monthly.total} compact /></dd>
            </dl>
            {plane.grounded && (
              <div className="rounded-card bg-okada-soft p-3 text-sm text-okada">
                <p className="font-bold">Grounded: unpaid bills.</p>
                <p>
                  Settle <Money amount={plane.arrears} /> to fly again.
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {plane.grounded ? (
                <Button variant="danger" onClick={() => setPending({ kind: 'reinstate', plane })}>
                  Pay and clear to fly
                </Button>
              ) : (
                <Button variant="danfo" icon={<PlaneTakeoff size={18} aria-hidden />} onClick={() => setFlying(plane.id)}>
                  Fly
                </Button>
              )}
              <Button variant="paper" icon={<Paintbrush size={18} aria-hidden />} onClick={() => setEditing(plane.id)}>
                Make it yours
              </Button>
              {!plane.airborne && (
                <Button variant="paper" onClick={() => setPending({ kind: 'sell', plane })}>
                  Sell
                </Button>
              )}
            </div>
            {plane.flyBlocker && !plane.grounded && <p className="-mt-1 text-xs text-text-soft">{plane.flyBlocker}.</p>}
          </li>
        ))}
      </ul>

      <FlySheet plane={flyingPlane} onClose={() => setFlying(null)} />
      <MakeItYoursSheet plane={editingPlane} onClose={() => setEditing(null)} />

      <ConfirmSheet
        open={pending?.kind === 'sell'}
        onClose={() => setPending(null)}
        title={pending ? `Sell ${pending.plane.registration}?` : ''}
        description="A broker pays a share of what it's worth today."
        confirmLabel={pending ? `Sell for ${Math.round(pending.plane.saleOffer / 1_000_000).toLocaleString('en-NG')}m` : 'Sell'}
        loading={sell.isPending}
        onConfirm={() => {
          if (!pending) return;
          sell.mutate(pending.plane.id, {
            onSuccess: (result) => {
              announce('Aircraft sold', { body: `${result.registration} went to a broker.`, amount: result.amount - result.arrearsSettled });
              setPending(null);
            },
            onError: (error) => complain('Sale didn’t go through', error),
          });
        }}
      >
        {pending && (
          <p className="text-sm">
            Offer today: <Money amount={pending.plane.saleOffer} />
            {pending.plane.arrears > 0 && (
              <>
                , less <Money amount={pending.plane.arrears} /> in unpaid bills.
              </>
            )}
          </p>
        )}
      </ConfirmSheet>
      <ConfirmSheet
        open={pending?.kind === 'reinstate'}
        onClose={() => setPending(null)}
        title={pending ? `Clear ${pending.plane.registration} to fly?` : ''}
        description="Back hangar, maintenance and crew bills."
        confirmLabel="Pay and clear"
        tone="danfo"
        loading={reinstate.isPending}
        onConfirm={() => {
          if (!pending) return;
          reinstate.mutate(pending.plane.id, {
            onSuccess: (result) => {
              announce('Cleared to fly', { body: `${result.aircraft.registration} is back on the line.`, amount: -result.paid });
              setPending(null);
            },
            onError: (error) => complain('Couldn’t settle the bills', error),
          });
        }}
      >
        {pending && (
          <p className="text-sm">
            You owe <Money amount={pending.plane.arrears} />.
          </p>
        )}
      </ConfirmSheet>
    </div>
  );
}
