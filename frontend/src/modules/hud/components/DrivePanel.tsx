import { Fuel, Wrench } from 'lucide-react';
import { FUEL_LOW_SHARE, VEHICLE_SERVICE_SOON_CONDITION } from '@insidelife/shared';
import type { DriveTelemetry } from '@/common/game/world-store';
import { cn } from '@/common/utils/cn';

/** Speedometer, fuel gauge (with the km it has left) and the engine light. */
export function DrivePanel({ drive }: { readonly drive: DriveTelemetry }) {
  const share = drive.tankLitres > 0 ? Math.max(0, Math.min(1, drive.fuelLitres / drive.tankLitres)) : 0;
  const low = share <= FUEL_LOW_SHARE;
  const engineLight = drive.condition < VEHICLE_SERVICE_SOON_CONDITION || drive.warning?.fix === 'mechanic';
  return (
    <div className="glass rounded-card px-3.5 py-2 text-right" aria-label="Driving" data-testid="drive-panel">
      <p className="type-figure text-3xl leading-none text-on-ink">
        {Math.round(drive.speedKmh)}
        <span className="ml-1 text-xs font-bold text-on-ink-soft">km/h</span>
      </p>
      <div className="mt-1 flex items-center justify-end gap-1.5 text-2xs text-on-ink-soft">
        {engineLight && <Wrench size={12} aria-label="Engine light on" className="text-okada" />}
        <Fuel size={12} aria-hidden className={low ? 'text-okada' : 'text-danfo'} />
        <span
          role="meter"
          aria-label="Fuel"
          aria-valuemin={0}
          aria-valuemax={Math.round(drive.tankLitres)}
          aria-valuenow={Math.round(drive.fuelLitres)}
          aria-valuetext={`${Math.round(drive.fuelLitres)} of ${Math.round(drive.tankLitres)} litres, about ${drive.rangeKm} km`}
          className="block h-1.5 w-14 overflow-hidden rounded-full bg-white/15"
        >
          <span className={cn('block h-full rounded-full', low ? 'bg-okada' : 'bg-danfo')} style={{ width: `${Math.round(share * 100)}%` }} />
        </span>
        <span className={cn('font-bold', low ? 'text-okada' : 'text-on-ink')}>{drive.rangeKm} km</span>
      </div>
    </div>
  );
}
