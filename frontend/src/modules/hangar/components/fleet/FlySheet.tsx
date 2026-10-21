'use client';

import { Fuel, PlaneTakeoff } from 'lucide-react';
import { cityOfVenue, findVenue, type OwnedAircraftDto } from '@insidelife/shared';
import { Badge, GoThere, HoldButton, Money, Receipt, Sheet } from '@/common/components';
import { announce, complain } from '@/common/game/feedback';
import { useSnapshot } from '@/common/game/snapshot';
import { useCurrentPlace } from '@/common/hooks/use-current-place';
import { useHangarCommands } from '../../hooks/use-hangar';
import { awayFromPlane, formatFlightTime, gatName } from '../../services/hangar-rules';

/** Fly to the other terminal: flight time and fuel bill up front, a hold to take off. */
export function FlySheet({ plane, onClose }: { readonly plane: OwnedAircraftDto | null; readonly onClose: () => void }) {
  const { fly } = useHangarCommands();
  const { data: snapshot } = useSnapshot();
  const { locationId, travelling } = useCurrentPlace();
  const terminal = plane ? findVenue(plane.parkedAt) : undefined;
  // Directions only within the city: there is no road to the other one (the message already names where it is).
  const guide = plane !== null && terminal !== undefined && awayFromPlane(plane, locationId, travelling) && cityOfVenue(terminal) === snapshot?.character.cityId;
  return (
    <Sheet open={plane !== null} onClose={onClose} title={plane ? `Fly ${plane.registration}` : ''} description={plane ? `Parked at ${gatName(plane.parkedAt)}` : undefined}>
      {plane && (
        <div className="flex flex-col gap-4 pb-2">
          {plane.flyBlocker ? (
            <div className="flex flex-col gap-3 rounded-card bg-paper-2 p-3">
              <p className="text-sm font-bold">{plane.flyBlocker}.</p>
              {guide && terminal && <GoThere venueId={terminal.id} venueName={terminal.name} />}
            </div>
          ) : (
            <p className="text-sm text-text-soft">You’re at the terminal and cleared to fly. Pick where you’re going.</p>
          )}
          <ul className="flex flex-col gap-3">
            {plane.flights.map((option) => {
              const short = snapshot ? option.fuelCost - snapshot.wallet.balance : 0;
              return (
                <li key={option.destination} className="flex flex-col gap-3 rounded-card bg-paper-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="type-title text-lg leading-tight">{gatName(option.destination)}</p>
                      <p className="text-sm text-text-soft">
                        {option.km} km · {formatFlightTime(option.minutes)}
                      </p>
                    </div>
                    {!option.open && <Badge tone="warn">Opens soon</Badge>}
                  </div>
                  <Receipt
                    lines={[{ label: <span className="inline-flex items-center gap-1.5"><Fuel size={14} aria-hidden />{option.fuelLitres.toLocaleString('en-NG')} L of fuel</span>, amount: option.fuelCost }]}
                    total={{ label: 'Fuel bill', amount: option.fuelCost }}
                  />
                  {short > 0 && (
                    <p className="text-sm font-bold text-okada">
                      You’re short by <Money amount={short} />.
                    </p>
                  )}
                  <HoldButton
                    disabled={plane.flyBlocker !== null || !option.open || short > 0 || fly.isPending}
                    onConfirm={() =>
                      fly.mutate(
                        { id: plane.id, destination: option.destination },
                        {
                          onSuccess: (result) => {
                            announce('Wheels up ✈️', {
                              body: `${result.aircraft.registration} to ${gatName(option.destination)}: ${formatFlightTime(result.minutes)}.`,
                              amount: -result.fuelCost,
                              sfx: 'ui-success',
                            });
                            onClose();
                          },
                          onError: (error) => complain('Couldn’t take off', error),
                        },
                      )
                    }
                  >
                    <PlaneTakeoff size={18} aria-hidden className="mr-2 inline" />
                    Hold to take off
                  </HoldButton>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
