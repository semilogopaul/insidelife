import { Check, Circle, Gift, Lightbulb, Navigation, Sparkles, TrendingUp } from 'lucide-react';
import { SKILL_LABELS, type LifeGoalDto, type LifeGoalRewardDto, type VenueType } from '@insidelife/shared';
import { openSkills, skillsMentioned } from '@/common/game/skill-changes';
import { useSnapshot } from '@/common/game/snapshot';
import { Badge, Button, Money, ProgressBar } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { formatProgress } from '../services/progress-format';

export interface GoalCardProps {
  readonly goal: LifeGoalDto;
  readonly onDirections: (types: readonly VenueType[]) => void;
}

/** One active Life Goal: what to do, how far along, the hint, the paths and what it pays. */
export function GoalCard({ goal, onDirections }: GoalCardProps) {
  const progressText = goal.progress ? formatProgress(goal.progress) : null;
  const goalTypes = goal.paths.length > 0 ? [] : goal.targetVenueTypes;
  const { data: snapshot } = useSnapshot();
  const mentioned = skillsMentioned([goal.description, goal.hint, ...goal.paths.flatMap((p) => [p.label, p.hint])].join(' '));
  return (
    <article className="flex flex-col gap-2.5 rounded-card bg-paper-2 p-3.5 ring-1 ring-line">
      <div className="flex items-start gap-2.5">
        <Circle size={20} aria-hidden className="mt-0.5 shrink-0 text-text-faint" />
        <div className="min-w-0 flex-1">
          <h4 className="type-title text-lg leading-tight">{goal.title}</h4>
          <p className="mt-0.5 text-sm text-text-soft">{goal.description}</p>
        </div>
        {goal.optional && <Badge>Optional</Badge>}
      </div>

      {goal.progress && progressText && (
        <div className="flex items-center gap-2.5 pl-7">
          <ProgressBar value={goal.progress.current} max={goal.progress.target} label={`${goal.title} progress`} />
          <span className="tabular shrink-0 text-xs font-bold text-text-soft">{progressText}</span>
        </div>
      )}

      {goal.paths.length === 0 && (
        <p className="flex gap-2 pl-7 text-sm text-text">
          <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0 text-danfo-deep" />
          <span>{goal.hint}</span>
        </p>
      )}

      {goal.paths.length > 0 && (
        <ul className="flex flex-col gap-1.5 pl-7" aria-label="Ways to do it">
          {goal.paths.map((path) => (
            <li key={path.id} className={cn('rounded-chip px-3 py-2', path.met ? 'bg-naira-soft' : 'bg-paper')}>
              <p className="flex items-center gap-1.5 text-sm font-bold">
                {path.met ? <Check size={15} aria-hidden className="text-naira" /> : <Sparkles size={14} aria-hidden className="text-danfo-deep" />}
                {path.label}
                {path.met && <span className="sr-only">(done)</span>}
              </p>
              <p className="mt-0.5 text-sm text-text-soft">{path.hint}</p>
              {!path.met && path.targetVenueTypes.length > 0 && (
                <Button size="sm" variant="paper" className="mt-1.5" icon={<Navigation size={14} aria-hidden />} onClick={() => onDirections(path.targetVenueTypes)}>
                  Get directions
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {mentioned.length > 0 && snapshot && (
        <Button size="sm" variant="paper" className="ml-7 self-start" icon={<TrendingUp size={14} aria-hidden />} onClick={openSkills}>
          {mentioned.map((skill) => `${SKILL_LABELS[skill]} ${Math.floor(snapshot.character.skills[skill])}`).join(' · ')} · See skills
        </Button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pl-7">
        <Rewards reward={goal.reward} />
        {goalTypes.length > 0 && (
          <Button size="sm" icon={<Navigation size={14} aria-hidden />} onClick={() => onDirections(goalTypes)}>
            Get directions
          </Button>
        )}
      </div>
    </article>
  );
}

export function Rewards({ reward }: { readonly reward: LifeGoalRewardDto }) {
  const parts = [
    reward.cash > 0 && (
      <span key="cash" className="font-bold text-naira">
        <Money amount={reward.cash} compact />
      </span>
    ),
    reward.clout > 0 && <span key="clout">+{reward.clout} clout</span>,
    reward.item && <span key="item">{reward.item}</span>,
  ].filter(Boolean);
  if (parts.length === 0 && !reward.bonus) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-soft">
      <Gift size={14} aria-hidden className="text-text-faint" />
      <span className="sr-only">Reward:</span>
      {parts}
      {reward.bonus && <span className="text-ankara">Bonus: {reward.bonus.label}</span>}
    </p>
  );
}
