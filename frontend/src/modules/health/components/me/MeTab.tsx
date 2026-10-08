'use client';

import { BedDouble, HeartPulse, Stethoscope } from 'lucide-react';
import { formatDate, type GameMinute, type HealthViewDto } from '@insidelife/shared';
import { Money, Section } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { relativeGameTime } from '@/common/utils/game-time';
import { activeIllnesses, driftLines } from '../../services/health-rules';
import { ConditionCard } from './ConditionCard';
import { PregnancyCard } from './PregnancyCard';
import { VitalsPanel } from './VitalsPanel';

/** Your body today: vitals, anything wrong (and how to fix it), pregnancy, and why health moved yesterday. */
export function MeTab({
  view,
  now,
  onCheckUp,
}: {
  readonly view: HealthViewDto;
  readonly now: GameMinute;
  readonly onCheckUp: () => void;
}) {
  const illnesses = activeIllnesses(view.conditions);
  const drift = driftLines(view.drift);

  return (
    <div className="flex flex-col gap-6">
      <VitalsPanel view={view} />

      {view.here && (
        <p className="flex items-center gap-2.5 rounded-card bg-naira-soft p-3 text-sm">
          <Stethoscope size={18} aria-hidden className="shrink-0 text-naira" />
          <span>
            You’re at <strong>{view.here.venueName}</strong>
            {view.here.open ? '. Treatment and check-ups happen right here.' : ', but it’s closed right now.'}
          </span>
        </p>
      )}

      {view.admission && (
        <p className="flex items-start gap-2.5 rounded-card bg-cobalt-soft p-3 text-sm">
          <BedDouble size={18} aria-hidden className="mt-0.5 shrink-0 text-cobalt" />
          <span>
            On the ward at <strong>{view.admission.venueName}</strong> for {view.admission.reason}. Discharge{' '}
            {formatDate(view.admission.dischargeAt)} ({relativeGameTime(view.admission.dischargeAt, now)}).
            Bill <Money amount={view.admission.dailyBill} className="font-bold" /> a day.
          </span>
        </p>
      )}

      <Section
        title="How you feel"
        aside={
          illnesses.length > 0
            ? `${illnesses.length} thing${illnesses.length === 1 ? '' : 's'} wrong`
            : undefined
        }
      >
        {illnesses.length === 0 ? (
          <div className="flex items-center gap-3 rounded-card bg-paper-2 p-3.5 text-sm">
            <HeartPulse size={22} aria-hidden className="shrink-0 text-naira" />
            <p className="min-w-0 flex-1">
              Nothing wrong that you know of. Sleep well, eat well — and a yearly check-up catches the quiet
              ones (blood pressure, sugar).
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {illnesses.map((condition) => (
              <ConditionCard
                key={condition.id}
                condition={condition}
                facilities={view.facilities}
                here={view.here}
              />
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onCheckUp}
          className="self-start text-sm font-bold text-cobalt hover:underline"
        >
          Feeling off? Find a check-up
        </button>
      </Section>

      {view.pregnancy && <PregnancyCard pregnancy={view.pregnancy} here={view.here} now={now} />}

      {drift.length > 0 && (
        <Section
          title="Yesterday"
          aside={`${view.drift.total >= 0 ? '+' : '−'}${Math.abs(view.drift.total).toFixed(1)} health`}
        >
          <ul className="flex flex-col gap-1.5 text-sm">
            {drift.map((line) => (
              <li key={line.label} className="flex items-baseline justify-between gap-3">
                <span>{line.label}</span>
                <span className={cn('tabular font-bold', line.value < 0 ? 'text-okada' : 'text-naira')}>
                  {line.value > 0 ? '+' : '−'}
                  {Math.abs(line.value).toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
