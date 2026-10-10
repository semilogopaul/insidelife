import { Navigation, Smartphone } from 'lucide-react';
import { nearestServicePoint, serviceLocationId, type VehicleWarning } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useUi } from '@/common/game/ui-store';
import { useWorld } from '@/common/game/world-store';
import { cn } from '@/common/utils/cn';

/** Where you are to the nearest 40 m (the nearest station only changes that often; no re-render per pose update). */
const GRID_M = 40;

/**
 * The car's most urgent problem while driving ("Fuel low: 12 km left", "Engine light on: service soon", "Broken down"),
 * with GPS to the nearest filling station or mechanic, and — when the car can't go — the phone's Motors app for a
 * jerrycan, a roadside mechanic or a tow.
 */
export function DriveAlert({ warning }: { readonly warning: VehicleWarning }) {
  const destinationId = useNavigation((state) => state.destinationId);
  const cell = useWorld((state) => (state.position ? `${Math.round(state.position.x / GRID_M)},${Math.round(state.position.z / GRID_M)}` : null));
  const [cx, cz] = cell ? cell.split(',').map(Number) : [];
  const target = cx !== undefined && cz !== undefined ? nearestServicePoint(warning.fix, { x: cx * GRID_M, z: cz * GRID_M }) : null;
  const guiding = target !== null && destinationId === serviceLocationId(target);
  const stop = warning.severity === 'stop';
  return (
    <div role="status" data-testid="drive-alert" className={cn('glass flex items-center gap-2 rounded-card px-3 py-2 text-sm text-on-ink', stop && 'ring-2 ring-okada')}>
      <span aria-hidden className="text-lg leading-none">
        {warning.fix === 'fuel' ? '⛽' : '🔧'}
      </span>
      <span className="min-w-0 flex-1 font-bold leading-tight">{warning.text}</span>
      {target && !guiding && (
        <button
          type="button"
          onClick={() => {
            gameEvents.emit('sfx', { id: 'ui-success' });
            useNavigation.getState().setDestination(serviceLocationId(target), target.name);
          }}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-danfo px-3 text-xs font-bold text-ink"
          aria-label={`GPS to ${target.name}`}
        >
          <Navigation size={14} aria-hidden />
          {warning.fix === 'fuel' ? 'Nearest fuel' : 'Nearest mechanic'}
        </button>
      )}
      {stop && (
        <button
          type="button"
          onClick={() => {
            gameEvents.emit('sfx', { id: 'ui-open' });
            useUi.getState().openPhone('motors');
          }}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-paper px-3 text-xs font-bold text-ink"
          aria-label={warning.fix === 'fuel' ? 'Order a jerrycan in Motors' : 'Call a mechanic in Motors'}
        >
          <Smartphone size={14} aria-hidden />
          {warning.fix === 'fuel' ? 'Jerrycan' : 'Call mechanic'}
        </button>
      )}
    </div>
  );
}
