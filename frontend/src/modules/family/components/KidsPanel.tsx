'use client';

import { Baby, CircleAlert, School } from 'lucide-react';
import { useId } from 'react';
import { CHILD_MILESTONES, CHILD_SCHOOLS, CHILD_SCHOOL_TIERS, formatDate, formatNaira, type ChildDto, type ChildSchoolTier, type HouseholdDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { EmptyState, Money, StatTile, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useWorldState } from '@/common/game/use-game-clock';
import { cn } from '@/common/utils/cn';
import { useSetSchool } from '../hooks/use-family';
import { PersonAvatar } from './PersonAvatar';

/** Your children: school (with fees), milestones, sent-home warnings — and what the household costs. */
export function KidsPanel({ kids, household, onOpen }: { readonly kids: readonly ChildDto[]; readonly household: HouseholdDto; readonly onOpen: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="School fees next term" value={<Money amount={household.schoolFeesNextTerm} compact />} hint={`Term starts ${formatDate(household.nextTermStartsAt)}`} />
        <StatTile label="Nanny per month" value={<Money amount={household.childcarePerMonth} compact />} hint={household.childcarePerMonth === 0 ? 'Not needed right now' : 'While a child is under 5'} />
        <StatTile label="Living costs" value={`×${household.livingCostMultiplier.toFixed(2)}`} hint={`${household.dependants} dependant${household.dependants === 1 ? '' : 's'}`} />
        <StatTile label="Spouse" value={household.spouseWorking ? 'Working' : '—'} hint={household.spouseWorking ? 'Shares the bills' : 'One income'} />
      </div>
      {kids.length === 0 ? (
        <EmptyState icon={Baby} title="No children yet" body="With a partner, “Try for a baby” is in their sheet. Kids are your heirs — and your school-fees era." />
      ) : (
        <ul className="flex flex-col gap-3">
          {kids.map((child) => (
            <li key={child.id}>
              <ChildCard child={child} onOpen={() => onOpen(child.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChildCard({ child, onOpen }: { readonly child: ChildDto; readonly onOpen: () => void }) {
  const selectId = useId();
  const setSchool = useSetSchool();
  const { data: world } = useWorldState();
  const priceIndex = world?.economy.priceIndex ?? 1;
  const reached = new Set<string>(child.milestones);

  const change = (tier: ChildSchoolTier): void =>
    setSchool.mutate(
      { childId: child.id, tier },
      {
        onSuccess: () => {
          gameEvents.emit('sfx', { id: 'ui-success' });
          toast({ title: `${child.firstName} → ${CHILD_SCHOOLS[tier].label}`, body: tier === 'none' ? undefined : `${formatNaira(Math.round(CHILD_SCHOOLS[tier].feePerTerm * priceIndex))} per term.`, tone: 'neutral' });
        },
        onError: (error) => toast({ title: 'Couldn’t change school', body: errorMessage(error), tone: 'bad' }),
      },
    );

  return (
    <article className={cn('flex flex-col gap-3 rounded-card bg-paper-2 p-3.5 ring-1', child.sentHome ? 'ring-okada' : 'ring-line')}>
      <button type="button" onClick={onOpen} className="flex items-center gap-3 text-left">
        <PersonAvatar firstName={child.firstName} lastName={child.lastName} kind="child" closeness={child.closeness} alive={child.alive} />
        <span className="min-w-0 flex-1">
          <span className="type-title block text-lg leading-tight">
            {child.firstName} {child.lastName}
          </span>
          <span className="block text-sm text-text-soft">
            {child.age} year{child.age === 1 ? '' : 's'} old{child.waecCredits !== null ? `, ${child.waecCredits} WAEC credits` : ''}
          </span>
        </span>
      </button>

      {child.sentHome && (
        <p className="flex gap-2 rounded-chip bg-okada-soft p-2.5 text-sm font-bold text-okada" role="alert">
          <CircleAlert size={18} aria-hidden className="shrink-0" />
          {child.firstName} was sent home for unpaid fees. Keep enough cash for the term, or move to a cheaper school.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="flex items-center gap-1.5 text-sm font-bold">
          <School size={15} aria-hidden /> School
        </label>
        <select
          id={selectId}
          value={child.schoolTier}
          disabled={!child.guardian || setSchool.isPending}
          onChange={(event) => change(event.target.value as ChildSchoolTier)}
          className="h-11 rounded-chip bg-paper px-2 font-bold ring-1 ring-line disabled:opacity-60"
        >
          {CHILD_SCHOOL_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {CHILD_SCHOOLS[tier].label}
              {CHILD_SCHOOLS[tier].feePerTerm > 0 ? ` — ${formatNaira(Math.round(CHILD_SCHOOLS[tier].feePerTerm * priceIndex))}/term` : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-soft">
          {child.guardian ? CHILD_SCHOOLS[child.schoolTier].blurb : 'Their other parent pays these fees and picks the school.'}
          {child.feePerTerm > 0 ? ` This term: ${formatNaira(child.feePerTerm)}.` : ''}
        </p>
      </div>

      <ol className="flex flex-wrap gap-1.5" aria-label="Milestones">
        {CHILD_MILESTONES.map((milestone) => (
          <li
            key={milestone.id}
            className={cn('rounded-full px-2.5 py-1 text-2xs font-bold', reached.has(milestone.id) ? 'bg-naira-soft text-naira' : 'bg-paper text-text-faint ring-1 ring-line')}
          >
            {reached.has(milestone.id) ? '✓ ' : ''}
            {milestone.title}
          </li>
        ))}
      </ol>
    </article>
  );
}
