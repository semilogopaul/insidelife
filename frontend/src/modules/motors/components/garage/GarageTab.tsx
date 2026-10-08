'use client';

import { Gauge, Star, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { MAX_VEHICLES, type GameMinute, type OwnedVehicleDto, type VehiclesDto } from '@insidelife/shared';
import { Badge, Button, Money, ProgressBar } from '@/common/components';
import { useVehicleCommands } from '../../hooks/use-vehicles';
import { announce, complain } from '@/common/game/feedback';
import { gameDateTime } from '@/common/utils/game-time';
import { conditionWord } from '../../services/motors-rules';
import { CarArt, Plate } from '../CarArt';
import { ConfirmSheet } from '@/common/components';
import { NextStep } from '@/common/components';

type Pending = { readonly kind: 'repair' | 'sell'; readonly car: OwnedVehicleDto } | null;

/** Your cars: condition, value, plate, which one you drive, repairs and selling. */
export function GarageTab({
  data,
  now,
  onShop,
}: {
  readonly data: VehiclesDto;
  readonly now: GameMinute;
  readonly onShop: () => void;
}) {
  const { setPrimary, repair, sell } = useVehicleCommands();
  const [pending, setPending] = useState<Pending>(null);

  if (data.mine.length === 0) {
    const starters = [...data.catalogue].sort((a, b) => a.price - b.price).slice(0, 3);
    return (
      <div className="flex flex-col gap-5">
        <NextStep
          title="Get your first ride"
          body={
            <>
              Danfo is cheap but slow. A Naija-used car starts around{' '}
              {starters[0] ? (
                <Money amount={starters[0].price} compact className="font-bold text-on-ink" />
              ) : (
                'a few million'
              )}{' '}
              — Uncle Tunde’s money can do it.
            </>
          }
          actions={<Button onClick={onShop}>Browse cars</Button>}
        />
        <section aria-label="Starter cars" className="flex flex-col gap-2">
          <h3 className="type-title text-lg">Starter rides</h3>
          <ul className="grid grid-cols-3 gap-2">
            {starters.map((entry) => (
              <li key={entry.vehicle.id}>
                <button
                  type="button"
                  onClick={onShop}
                  className="flex w-full flex-col gap-1 rounded-card bg-paper-2 p-2 text-left hover:bg-paper-3"
                >
                  <CarArt model={entry.vehicle.model} color={entry.vehicle.color} />
                  <span className="truncate text-xs font-bold">“{entry.vehicle.nickname}”</span>
                  <Money amount={entry.price} compact className="text-xs text-text-soft" />
                </button>
              </li>
            ))}
          </ul>
        </section>
        {!data.licence.held && (
          <p className="text-sm text-text-soft">
            No licence yet? Police checkpoints will notice. Get one in the Licence tab (18+).
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-soft">
        {data.mine.length} of {MAX_VEHICLES} spaces in your compound. Maintenance is charged at month end.
      </p>
      <ul className="flex flex-col gap-3">
        {data.mine.map((car) => (
          <li key={car.id} className="flex flex-col gap-3 rounded-card bg-paper-2 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="type-title truncate text-lg leading-tight">{car.name}</p>
                <p className="text-sm text-text-soft">“{car.nickname}”</p>
              </div>
              <Plate plate={car.plate} />
            </div>
            <div className="px-6">
              <CarArt model={car.model} color={car.color} />
            </div>
            {car.status === 'in-transit' ? (
              <p className="rounded-card bg-cobalt-soft p-3 text-sm font-bold text-cobalt">
                On its way — arrives {car.arrivesAt !== null ? gameDateTime(car.arrivesAt, now) : 'soon'}.
              </p>
            ) : (
              <>
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Gauge size={15} aria-hidden /> Condition
                    </span>
                    <span className="tabular font-bold">
                      {Math.round(car.condition)} · {conditionWord(car.condition)}
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-1.5"
                    value={car.condition}
                    label={`${car.name} condition`}
                    tone={car.condition >= 70 ? 'naira' : car.condition >= 45 ? 'danfo' : 'okada'}
                  />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <Fact label="Worth">
                    <Money amount={car.value} compact />
                  </Fact>
                  <Fact label="Dealer offer">
                    <Money amount={car.saleOffer} compact />
                  </Fact>
                  <Fact label="Upkeep">
                    <Money amount={car.monthlyMaintenance} compact />
                    /mo
                  </Fact>
                </dl>
                <p className="text-xs text-text-soft">
                  {Math.round(car.mileageKm).toLocaleString('en-NG')} km on the clock
                </p>
                <div className="flex flex-wrap gap-2">
                  {car.isPrimary ? (
                    <Badge tone="good" className="h-9 px-3">
                      <Star size={13} aria-hidden /> Your daily ride
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="paper"
                      loading={setPrimary.isPending && setPrimary.variables === car.id}
                      onClick={() =>
                        setPrimary.mutate(car.id, {
                          onSuccess: () => announce(`${car.name} is your daily ride`, { sfx: 'car-door' }),
                          onError: (error) => complain('Couldn’t switch cars', error),
                        })
                      }
                    >
                      Drive this one
                    </Button>
                  )}
                  {car.repairCost > 0 && (
                    <Button
                      size="sm"
                      variant="ink"
                      icon={<Wrench size={15} aria-hidden />}
                      onClick={() => setPending({ kind: 'repair', car })}
                    >
                      Repair · <Money amount={car.repairCost} compact />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-okada hover:bg-okada-soft"
                    onClick={() => setPending({ kind: 'sell', car })}
                  >
                    Sell
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <ConfirmSheet
        open={pending !== null}
        onClose={() => setPending(null)}
        tone={pending?.kind === 'sell' ? 'danger' : 'danfo'}
        title={
          pending?.kind === 'repair'
            ? `Fix the ${pending.car.name}?`
            : pending
              ? `Sell the ${pending.car.name}?`
              : ''
        }
        description={
          pending?.kind === 'repair'
            ? 'Ladipo mechanics restore it to full condition today.'
            : 'The dealer pays cash now. The plate goes with the car.'
        }
        confirmLabel={pending?.kind === 'repair' ? 'Pay for the repair' : 'Sell to the dealer'}
        loading={repair.isPending || sell.isPending}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'repair') {
            repair.mutate(pending.car.id, {
              onSuccess: (result) => {
                setPending(null);
                announce('Good as new', { body: 'Your mechanic says “e don set”.', amount: -result.cost });
              },
              onError: (error) => complain('Repair didn’t happen', error),
            });
          } else {
            sell.mutate(pending.car.id, {
              onSuccess: (result) => {
                setPending(null);
                announce('Car sold', { body: `${result.plate} is no longer yours.`, amount: result.amount });
              },
              onError: (error) => complain('Sale didn’t go through', error),
            });
          }
        }}
      >
        {pending && (
          <p className="rounded-card bg-paper-2 p-3 text-sm">
            {pending.kind === 'repair' ? (
              <>
                Cost: <Money amount={pending.car.repairCost} className="font-bold" />
              </>
            ) : (
              <>
                Offer: <Money amount={pending.car.saleOffer} className="font-bold" /> (worth{' '}
                <Money amount={pending.car.value} compact /> on the open market)
              </>
            )}
          </p>
        )}
      </ConfirmSheet>
    </div>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="rounded-chip bg-paper px-2.5 py-2">
      <dt className="text-xs font-bold text-text-soft">{label}</dt>
      <dd className="mt-0.5 font-bold">{children}</dd>
    </div>
  );
}
