import { Fuel } from 'lucide-react';
import { Money } from '@/common/components';
import type { DriveTelemetry } from '@/common/game/world-store';

/** Speedometer and the fuel this drive has cost so far (charged by distance). */
export function DrivePanel({ drive }: { readonly drive: DriveTelemetry }) {
  return (
    <div className="glass rounded-card px-3.5 py-2 text-right" aria-label="Driving">
      <p className="type-figure text-3xl leading-none text-on-ink">
        {Math.round(drive.speedKmh)}
        <span className="ml-1 text-xs font-bold text-on-ink-soft">km/h</span>
      </p>
      <p className="mt-1 flex items-center justify-end gap-1 text-2xs text-on-ink-soft">
        <Fuel size={12} aria-hidden className="text-danfo" />
        Fuel so far <Money amount={drive.tripFuelCost} compact className="font-bold text-on-ink" />
      </p>
    </div>
  );
}
