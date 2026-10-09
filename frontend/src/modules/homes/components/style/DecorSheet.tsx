'use client';

import { useState } from 'react';
import {
  FLOOR_FINISHES,
  NO_DECOR,
  WALL_PAINTS,
  decorQuote,
  findFloorFinish,
  findWallPaint,
  formatNairaCompact,
  homeFloorArea,
  type DecorMakeoverRequest,
  type FloorFinishId,
  type HomeDto,
  type WallPaintId,
} from '@insidelife/shared';
import { Button, Receipt, Sheet } from '@/common/components';
import { useWorldState } from '@/common/game/use-game-clock';
import { useHousingCommands } from '../../hooks/use-housing';
import { Swatches } from './Swatches';

/** Wall paint and a new floor for the home you live in (rented or owned). */
export function DecorSheet({
  home,
  open,
  onClose,
}: {
  readonly home: HomeDto;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Paint & floors" description={home.label}>
      {open && <DecorForm home={home} onDone={onClose} />}
    </Sheet>
  );
}

function DecorForm({ home, onDone }: { readonly home: HomeDto; readonly onDone: () => void }) {
  const current = home.decor ?? NO_DECOR;
  const priceIndex = useWorldState().data?.economy.priceIndex ?? 1;
  const { redecorate } = useHousingCommands();
  const [paint, setPaint] = useState<WallPaintId | null>(current.paint);
  const [floor, setFloor] = useState<FloorFinishId | null>(current.floor);
  const request: DecorMakeoverRequest = {
    ...(paint !== current.paint && paint ? { paint } : {}),
    ...(floor !== current.floor && floor ? { floor } : {}),
  };
  const quote = decorQuote(home.bedrooms, current, request, priceIndex);
  const area = homeFloorArea(home.bedrooms);
  const wall = findWallPaint(paint)?.hex ?? '#e9e3d6';
  const finish = findFloorFinish(floor);

  return (
    <div className="flex flex-col gap-4 pb-2">
      <svg viewBox="0 0 240 110" role="img" aria-label="Preview of your room" className="w-full rounded-card">
        <rect x="0" y="0" width="240" height="72" fill={wall} />
        <rect x="0" y="66" width="240" height="6" fill="#00000014" />
        <polygon points="0,72 240,72 240,110 0,110" fill={finish?.hex ?? '#b9b2a2'} />
        {finish?.style === 'tiles' || finish?.style === 'marble' || finish?.style === 'terrazzo'
          ? [40, 80, 120, 160, 200].map((x) => (
              <line key={x} x1={x} y1="72" x2={x + (x - 120) * 0.25} y2="110" stroke="#00000018" />
            ))
          : null}
        {finish?.style === 'wood' &&
          [80, 88, 98].map((y) => <line key={y} x1="0" y1={y} x2="240" y2={y} stroke="#00000022" />)}
        <rect x="150" y="22" width="44" height="30" fill="#2f4450" stroke="#f4f2ec" strokeWidth="3" />
        <rect x="30" y="44" width="70" height="28" rx="4" fill="#4f7942" />
      </svg>
      <Swatches legend="Wall paint" options={WALL_PAINTS} value={paint} onChange={setPaint} />
      <Swatches
        legend={`Floor (${area} m²)`}
        options={FLOOR_FINISHES.map((option) => ({
          ...option,
          note: `${formatNairaCompact(option.pricePerSqm * priceIndex)}/m²`,
        }))}
        value={floor}
        onChange={setFloor}
      />
      {quote.lines.length > 0 ? (
        <Receipt
          lines={quote.lines.map((line) => ({ label: line.label, amount: line.cost }))}
          total={{ label: 'Total', amount: quote.total }}
          caption={
            home.ownership === 'rented'
              ? 'Renting: the landlord keeps the improvements when you move — no refund.'
              : 'Yours to keep. Prices move with the economy.'
          }
        />
      ) : (
        <p className="rounded-card bg-paper-2 p-3 text-sm text-text-soft">
          Pick a paint or a floor to see what the painters and tilers will charge.
        </p>
      )}
      <Button
        block
        disabled={quote.total === 0}
        loading={redecorate.isPending}
        onClick={() => redecorate.mutate(request, { onSuccess: onDone })}
      >
        {quote.total > 0 ? 'Get the workmen in' : 'Nothing to change'}
      </Button>
    </div>
  );
}
