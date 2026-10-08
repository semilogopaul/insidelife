import { HelpCircle } from 'lucide-react';
import { SECRET_ACHIEVEMENT_TEASER, formatDate, type AchievementDto } from '@insidelife/shared';
import { ProgressBar, Sheet } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { formatProgress } from '../services/progress-format';
import { NamedIcon } from '@/common/components';
import { RARITY_DISC, RARITY_TEXT } from './rarity';

/** Badge detail: what it's for, how rare it is across Lagos and how close you are. */
export function AchievementSheet({ achievement, onClose }: { readonly achievement: AchievementDto | null; readonly onClose: () => void }) {
  const masked = achievement ? achievement.secret && !achievement.unlocked : false;
  return (
    <Sheet open={achievement !== null} onClose={onClose} title={achievement ? (masked ? 'Secret badge' : achievement.title) : ''} size="sm">
      {achievement && (
        <div className="flex flex-col items-center gap-3 pb-3 text-center">
          <span className={cn('grid size-20 place-items-center rounded-full', achievement.unlocked ? RARITY_DISC[achievement.rarity] : 'bg-paper-3 text-text-faint')}>
            {masked ? <HelpCircle size={36} aria-hidden /> : <NamedIcon name={achievement.icon} size={36} aria-hidden />}
          </span>
          <p className={cn('text-sm font-bold', RARITY_TEXT[achievement.rarity])}>
            {achievement.rarityLabel} — {achievement.rarityPercent > 0 ? `${achievement.rarityPercent}% of players have it` : 'nobody has it yet'}
          </p>
          <p className="text-pretty text-text">{masked ? SECRET_ACHIEVEMENT_TEASER : achievement.description}</p>
          {achievement.unlocked && achievement.unlockedAt !== null && (
            <p className="text-sm text-text-soft">Unlocked {formatDate(achievement.unlockedAt)}</p>
          )}
          {!achievement.unlocked && achievement.progress && formatProgress(achievement.progress) && (
            <div className="flex w-full items-center gap-2.5">
              <ProgressBar value={achievement.progress.current} max={achievement.progress.target} label="Badge progress" />
              <span className="tabular shrink-0 text-xs font-bold text-text-soft">{formatProgress(achievement.progress)}</span>
            </div>
          )}
          {achievement.clout > 0 && <p className="text-xs text-text-soft">Worth +{achievement.clout} clout</p>}
        </div>
      )}
    </Sheet>
  );
}
