'use client';

import { useState } from 'react';
import {
  BLUEPRINTS,
  GATE_COLOURS,
  HOUSE_NAME_PATTERN,
  HOUSE_PAINTS,
  NO_EXTERIOR,
  ROOF_COLOURS,
  exteriorQuote,
  findGateColour,
  findHousePaint,
  findRoofColour,
  type BlueprintId,
  type ExteriorMakeoverRequest,
  type GateColourId,
  type HousePaintId,
  type PropertyDto,
  type RoofColourId,
} from '@insidelife/shared';
import { Button, Receipt, Sheet, TextField } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useWorldState } from '@/common/game/use-game-clock';
import { useHousingCommands } from '../../hooks/use-housing';
import { Swatches } from './Swatches';

/** As built, before any makeover (matches the city's default look). */
const BUILT_PAINT: Readonly<Record<BlueprintId, string>> = {
  bungalow: '#f1e3c6',
  duplex: '#f4efe4',
  'block-of-flats': '#e9dfcf',
  mansion: '#fbf8f1',
};
const BUILT_ROOF: Readonly<Record<BlueprintId, string>> = {
  bungalow: '#8e2b2b',
  duplex: '#2f5d50',
  'block-of-flats': '#d8d2c4',
  mansion: '#3a3d44',
};
const PLATE: Readonly<Record<BlueprintId, string>> = {
  bungalow: 'House',
  duplex: 'Lodge',
  'block-of-flats': 'Court',
  mansion: 'Villa',
};

/** Paint, roofing sheets, gate and the name on the gate for a finished house you own, with a live preview. */
export function ExteriorSheet({
  property,
  open,
  onClose,
}: {
  readonly property: PropertyDto;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Make it yours" description={property.label}>
      {open && property.building && (
        <ExteriorForm property={property} blueprintId={property.building.blueprintId} onDone={onClose} />
      )}
    </Sheet>
  );
}

function ExteriorForm({
  property,
  blueprintId,
  onDone,
}: {
  readonly property: PropertyDto;
  readonly blueprintId: BlueprintId;
  readonly onDone: () => void;
}) {
  const current = property.building?.exterior ?? NO_EXTERIOR;
  const lastName = useSnapshot().data?.character.lastName ?? '';
  const priceIndex = useWorldState().data?.economy.priceIndex ?? 1;
  const { restyle } = useHousingCommands();
  const [paint, setPaint] = useState<HousePaintId | null>(current.paint);
  const [roof, setRoof] = useState<RoofColourId | null>(current.roof);
  const [gate, setGate] = useState<GateColourId | null>(current.gate);
  const [name, setName] = useState(current.name ?? '');
  const trimmed = name.trim();
  const nameError =
    trimmed !== '' && !HOUSE_NAME_PATTERN.test(trimmed)
      ? "Use 2-24 letters, numbers, spaces and . & - '"
      : null;
  const request: ExteriorMakeoverRequest = {
    ...(paint !== current.paint && paint ? { paint } : {}),
    ...(roof !== current.roof && roof ? { roof } : {}),
    ...(gate !== current.gate && gate ? { gate } : {}),
    ...((trimmed || null) !== current.name ? { name: trimmed || null } : {}),
  };
  const quote = exteriorQuote(blueprintId, current, request, priceIndex);
  const plate = (trimmed || `${lastName} ${PLATE[blueprintId]}`).toUpperCase();

  return (
    <div className="flex flex-col gap-4 pb-2">
      <HousePreview
        blueprintId={blueprintId}
        wall={findHousePaint(paint)?.hex ?? BUILT_PAINT[blueprintId]}
        roof={findRoofColour(roof)?.hex ?? BUILT_ROOF[blueprintId]}
        gate={findGateColour(gate)?.hex ?? '#2b2b2e'}
        plate={plate}
      />
      <Swatches legend="House paint" options={HOUSE_PAINTS} value={paint} onChange={setPaint} />
      <Swatches
        legend={blueprintId === 'block-of-flats' ? 'Parapet & trim' : 'Roofing sheets'}
        options={ROOF_COLOURS}
        value={roof}
        onChange={setRoof}
      />
      <Swatches legend="Gate" options={GATE_COLOURS} value={gate} onChange={setGate} />
      <TextField
        label="Name on the gate"
        placeholder={`${lastName} ${PLATE[blueprintId]}`}
        value={name}
        maxLength={24}
        onChange={(event) => setName(event.target.value)}
        error={nameError}
        hint="Leave empty for your surname and the house type."
      />
      {quote.lines.length > 0 ? (
        <Receipt
          lines={quote.lines.map((line) => ({ label: line.label, amount: line.cost }))}
          total={{ label: 'Total', amount: quote.total }}
          caption={
            paint && paint !== current.paint
              ? 'A fresh coat also covers cracks and mould: the house’s condition improves a little.'
              : 'Prices move with the economy.'
          }
        />
      ) : (
        <p className="rounded-card bg-paper-2 p-3 text-sm text-text-soft">
          Pick a colour or a name to see the painter’s quote.
        </p>
      )}
      <Button
        block
        disabled={quote.total === 0 || nameError !== null}
        loading={restyle.isPending}
        onClick={() => restyle.mutate({ propertyId: property.id, body: request }, { onSuccess: onDone })}
      >
        {quote.total > 0 ? `Pay the workmen` : 'Nothing to change'}
      </Button>
      <p className="text-center text-xs text-text-soft">
        {BLUEPRINTS[blueprintId].label} · only what changes is charged
      </p>
    </div>
  );
}

/** A flat front elevation of the house in the chosen colours (the real thing is in the city). */
function HousePreview({
  blueprintId,
  wall,
  roof,
  gate,
  plate,
}: {
  readonly blueprintId: BlueprintId;
  readonly wall: string;
  readonly roof: string;
  readonly gate: string;
  readonly plate: string;
}) {
  const storeys = blueprintId === 'bungalow' ? 1 : blueprintId === 'block-of-flats' ? 3 : 2;
  const floor = 34;
  const top = 128 - storeys * floor;
  const flat = blueprintId === 'block-of-flats';
  return (
    <svg
      viewBox="0 0 240 150"
      role="img"
      aria-label={`Preview: ${plate}`}
      className="w-full rounded-card bg-[#cfe6f2]"
    >
      <rect x="0" y="128" width="240" height="22" fill="#b9b2a2" />
      <rect x="45" y={top} width="150" height={128 - top} fill={wall} stroke="#00000022" />
      {flat ? (
        <rect x="42" y={top - 6} width="156" height="8" fill={roof} />
      ) : (
        <polygon points={`32,${top + 2} 120,${top - 34} 208,${top + 2}`} fill={roof} />
      )}
      {Array.from({ length: storeys }, (_, s) => (
        <g key={s}>
          {[62, 152].map((x) => (
            <rect
              key={x}
              x={x}
              y={128 - (s + 1) * floor + 8}
              width="26"
              height="18"
              fill="#2f4450"
              stroke="#f4f2ec"
              strokeWidth="2"
            />
          ))}
        </g>
      ))}
      <rect x="110" y="104" width="20" height="24" fill="#6b3f22" />
      {blueprintId === 'mansion' &&
        [92, 104, 136, 148].map((x) => (
          <rect key={x} x={x} y={top + 2} width="4" height={126 - top} fill="#f4f2ec" />
        ))}
      {/* Fence, gate and plate in front. */}
      <rect x="0" y="118" width="88" height="22" fill={wall} stroke="#00000022" />
      <rect x="152" y="118" width="88" height="22" fill={wall} stroke="#00000022" />
      <rect x="92" y="116" width="56" height="26" fill={gate} />
      <rect x="10" y="123" width="70" height="11" rx="1" fill="#1b1b1b" />
      <text x="45" y="131" textAnchor="middle" fontSize="7" fontWeight="800" fill="#e0c36a">
        {plate.slice(0, 22)}
      </text>
    </svg>
  );
}
