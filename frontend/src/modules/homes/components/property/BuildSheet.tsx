'use client';

import { useState } from 'react';
import {
  BLUEPRINTS,
  BLUEPRINT_IDS,
  UPFRONT_BUILD_DISCOUNT,
  type BlueprintId,
  type ConstructionPaymentPlan,
  type PropertyDto,
} from '@insidelife/shared';
import { HoldButton, Money, Sheet } from '@/common/components';
import { useWorldState } from '@/common/game/use-game-clock';
import { cn } from '@/common/utils/cn';
import { useHousingCommands } from '../../hooks/use-housing';
import { FilterChips } from '@/common/components';
import { Receipt } from '@/common/components';

/** Pick a blueprint that fits the plot, choose milestone payments or upfront (5% off), hold to start building. */
export function BuildSheet({
  property,
  onClose,
}: {
  readonly property: PropertyDto | null;
  readonly onClose: () => void;
}) {
  return (
    <Sheet
      open={property !== null}
      onClose={onClose}
      title="Build on your land"
      description={
        property ? `${property.label} · ${property.sizeSqm.toLocaleString('en-NG')} m²` : undefined
      }
    >
      {property && <BuildForm key={property.id} property={property} onDone={onClose} />}
    </Sheet>
  );
}

function BuildForm({ property, onDone }: { readonly property: PropertyDto; readonly onDone: () => void }) {
  const { build } = useHousingCommands();
  const priceIndex = useWorldState().data?.economy.priceIndex ?? 1;
  const fits = BLUEPRINT_IDS.filter((id) => BLUEPRINTS[id].minSqm <= property.sizeSqm);
  const [blueprintId, setBlueprintId] = useState<BlueprintId>(fits[0] ?? 'bungalow');
  const [payment, setPayment] = useState<ConstructionPaymentPlan>('milestones');
  const blueprint = BLUEPRINTS[blueprintId];
  const estimate = Math.round(blueprint.baseCost * priceIndex);
  const upfrontPrice = Math.round(estimate * (1 - UPFRONT_BUILD_DISCOUNT));

  return (
    <div className="flex flex-col gap-4 pb-2">
      <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Blueprint">
        {BLUEPRINT_IDS.map((id) => {
          const option = BLUEPRINTS[id];
          const allowed = option.minSqm <= property.sizeSqm;
          const selected = id === blueprintId;
          return (
            <li key={id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!allowed}
                onClick={() => setBlueprintId(id)}
                className={cn(
                  'flex w-full items-start justify-between gap-3 rounded-card p-3 text-left ring-1 disabled:opacity-45',
                  selected ? 'bg-danfo-soft ring-danfo' : 'bg-paper-2 ring-transparent',
                )}
              >
                <span className="min-w-0 text-sm">
                  <span className="block font-bold">{option.label}</span>
                  <span className="block text-text-soft">
                    {allowed
                      ? `${option.months} months · ${option.units > 1 ? `${option.units} units to let` : `${option.bedrooms} bedrooms`}`
                      : `Needs ${option.minSqm.toLocaleString('en-NG')} m² — buy more plots`}
                  </span>
                </span>
                <Money
                  amount={Math.round(option.baseCost * priceIndex)}
                  compact
                  className="shrink-0 font-bold"
                />
              </button>
            </li>
          );
        })}
      </ul>
      <FilterChips
        label="How to pay"
        value={payment}
        onChange={setPayment}
        options={[
          { id: 'milestones', label: 'Pay as it rises' },
          { id: 'upfront', label: `All now (−${Math.round(UPFRONT_BUILD_DISCOUNT * 100)}%)` },
        ]}
      />
      <Receipt
        lines={
          payment === 'upfront'
            ? [
                { label: blueprint.label, amount: estimate },
                { label: 'Upfront discount', amount: upfrontPrice - estimate },
              ]
            : [
                {
                  label: `${blueprint.label} (estimated budget)`,
                  amount: estimate,
                  note: 'Paid monthly as the contractor hits milestones',
                },
              ]
        }
        total={{
          label: payment === 'upfront' ? 'You pay now' : 'Budget',
          amount: payment === 'upfront' ? upfrontPrice : estimate,
        }}
        caption="About 1 in 5 builds runs over budget (materials, “area boys”). Prices follow today’s economy."
      />
      <HoldButton
        disabled={build.isPending}
        onConfirm={() =>
          build.mutate({ propertyId: property.id, blueprintId, payment }, { onSuccess: onDone })
        }
      >
        Hold to start building
      </HoldButton>
    </div>
  );
}
