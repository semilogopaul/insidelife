import { HEALTH_BANDS, type HealthViewDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { healthTone } from '../../services/health-rules';

const FILL = { good: 'bg-naira', warn: 'bg-danfo', bad: 'bg-okada', neutral: 'bg-on-ink-soft' } as const;

/** Your health at a glance: the number, what it means in plain words, and the band ladder it sits on. */
export function VitalsPanel({ view }: { readonly view: HealthViewDto }) {
  const health = Math.round(view.health);
  const tone = healthTone(view.health);
  return (
    <section
      aria-label="Your health"
      className="relative overflow-hidden rounded-card bg-ink px-4 pb-5 pt-4 text-on-ink"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-on-ink-soft">Health</p>
          <p className="flex items-baseline gap-1.5">
            <span
              className={cn(
                'type-figure text-[3.5rem] leading-none',
                tone === 'bad' ? 'text-okada' : 'text-danfo',
              )}
            >
              {health}
            </span>
            <span className="type-figure text-lg text-on-ink-soft">/100</span>
          </p>
        </div>
        <p className="type-slogan pb-1 text-right text-[1.75rem] text-on-ink">{view.healthLabel}</p>
      </div>
      <div
        className="relative mt-3"
        role="meter"
        aria-label="Health"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={health}
        aria-valuetext={`${health}, ${view.healthLabel}`}
      >
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn('h-full rounded-full transition-[width] duration-700', FILL[tone])}
            style={{ width: `${health}%` }}
          />
        </div>
        {HEALTH_BANDS.slice(0, -1).map((band) => (
          <span
            key={band.min}
            aria-hidden
            className="absolute top-0 h-2.5 w-px bg-ink"
            style={{ left: `${band.min}%` }}
          />
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <Vital label="Fitness" value={`${Math.round(view.fitness)}`} />
        <Vital label="Mood" value={`${Math.round(view.mood)}`} />
        <Vital
          label="Energy cap"
          value={view.energyCap >= 100 ? 'None' : `${Math.round(view.energyCap)}`}
          warn={view.energyCap < 100}
        />
      </dl>
      <span
        aria-hidden
        className="danfo-stripes absolute inset-x-0 bottom-0 block h-[9px] [--color-ink:var(--color-danfo)]"
      />
    </section>
  );
}

function Vital({
  label,
  value,
  warn = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly warn?: boolean;
}) {
  return (
    <div className="rounded-chip bg-white/6 px-2.5 py-2">
      <dt className="text-xs text-on-ink-soft">{label}</dt>
      <dd className={cn('type-figure text-lg', warn && 'text-okada')}>{value}</dd>
    </div>
  );
}
