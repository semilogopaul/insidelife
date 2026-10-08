import { ArrowLeft, ArrowRight, ArrowUp, CornerUpLeft, CornerUpRight, Flag, Navigation, RotateCcw, X, type LucideIcon } from 'lucide-react';
import type { NavigationInstruction } from '@/common/game/navigation-store';

const MANEUVER_ICON: Record<NavigationInstruction['maneuver'], LucideIcon> = {
  depart: Navigation,
  straight: ArrowUp,
  left: ArrowLeft,
  right: ArrowRight,
  'slight-left': CornerUpLeft,
  'slight-right': CornerUpRight,
  'u-turn': RotateCcw,
  roundabout: RotateCcw,
  arrive: Flag,
};

const formatDistance = (metres: number): string => (metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(metres / 10) * 10)} m`);

/** Turn-by-turn banner, styled like a danfo side panel: yellow with the double stripe. */
export function GpsBanner({ instruction, destination, remaining, onStop }: {
  readonly instruction: NavigationInstruction | null;
  readonly destination: string;
  readonly remaining: number | null;
  readonly onStop: () => void;
}) {
  const Icon = instruction ? MANEUVER_ICON[instruction.maneuver] : Navigation;
  return (
    <div className="relative overflow-hidden rounded-card bg-danfo text-ink shadow-[var(--shadow-glass)]">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <Icon size={30} aria-hidden strokeWidth={2.6} />
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="type-title truncate text-lg leading-tight">{instruction ? instruction.text : `Route to ${destination}`}</p>
          <p className="text-xs font-bold opacity-80">
            {instruction ? `${formatDistance(instruction.distance)} · ` : ''}
            {remaining !== null ? `${formatDistance(remaining)} to ${destination}` : destination}
          </p>
        </div>
        <button type="button" onClick={onStop} aria-label="End navigation" className="grid size-9 place-items-center rounded-full hover:bg-ink/10">
          <X size={18} aria-hidden />
        </button>
      </div>
      <span aria-hidden className="block h-[9px] danfo-stripes" />
    </div>
  );
}
