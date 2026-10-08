import { HelpCircle, Lock } from 'lucide-react';
import type { AchievementDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { progressRatio } from '../services/progress-format';
import { NamedIcon } from '@/common/components';
import { RARITY_DISC, RARITY_TEXT } from './rarity';

/** A badge on the wall. Locked badges are greyed; locked secrets are masked ("???"). */
export function AchievementTile({ achievement, onOpen }: { readonly achievement: AchievementDto; readonly onOpen: () => void }) {
  const masked = achievement.secret && !achievement.unlocked;
  const ratio = progressRatio(achievement.progress);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('flex h-full w-full flex-col items-center gap-1.5 rounded-card px-2 pb-2.5 pt-3 text-center', achievement.unlocked ? 'bg-paper-2 ring-1 ring-line' : 'bg-paper-2/60')}
    >
      <span
        className={cn(
          'relative grid size-12 place-items-center rounded-full',
          achievement.unlocked ? RARITY_DISC[achievement.rarity] : 'bg-paper-3 text-text-faint',
        )}
      >
        {masked ? <HelpCircle size={22} aria-hidden /> : <NamedIcon name={achievement.icon} size={22} aria-hidden />}
        {!achievement.unlocked && !masked && (
          <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-paper text-text-faint ring-1 ring-line">
            <Lock size={11} aria-hidden />
          </span>
        )}
      </span>
      <span className={cn('line-clamp-2 text-xs font-bold leading-tight', !achievement.unlocked && 'text-text-soft', masked && 'blur-[3px] select-none')}>
        {masked ? 'Secret badge' : achievement.title}
      </span>
      <span className={cn('text-2xs font-bold', achievement.unlocked ? RARITY_TEXT[achievement.rarity] : 'text-text-faint')}>
        {achievement.rarityLabel}
        {!achievement.unlocked && <span className="sr-only"> (locked)</span>}
      </span>
      {!achievement.unlocked && achievement.progress && ratio > 0 && (
        <span aria-hidden className="h-1 w-3/4 overflow-hidden rounded-full bg-paper-3">
          <span className="block h-full rounded-full bg-danfo" style={{ width: `${ratio * 100}%` }} />
        </span>
      )}
    </button>
  );
}
