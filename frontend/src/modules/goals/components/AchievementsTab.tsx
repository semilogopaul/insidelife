'use client';

import { useMemo, useState } from 'react';
import { ACHIEVEMENT_CATEGORIES, type AchievementCategory, type AchievementDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, ProgressBar, Spinner } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useAchievements } from '../hooks/use-goals';
import { progressRatio } from '../services/progress-format';
import { AchievementSheet } from './AchievementSheet';
import { AchievementTile } from './AchievementTile';

const CATEGORY_LABELS: Readonly<Record<AchievementCategory, string>> = {
  city: 'City',
  food: 'Food',
  social: 'Social',
  health: 'Health',
  school: 'School',
  work: 'Work',
  money: 'Money',
  home: 'Home',
  love: 'Love',
  status: 'Status',
};

type Filter = AchievementCategory | 'all' | 'unlocked';

/** The badge wall: unlocked first, then closest to unlocking. */
export function AchievementsTab() {
  const achievements = useAchievements(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useMemo(() => {
    const items = achievements.data?.achievements ?? [];
    const filtered = items.filter((item) => (filter === 'all' ? true : filter === 'unlocked' ? item.unlocked : item.category === filter));
    return filtered.toSorted(
      (a: AchievementDto, b: AchievementDto) =>
        Number(b.unlocked) - Number(a.unlocked) || (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0) || progressRatio(b.progress) - progressRatio(a.progress),
    );
  }, [achievements.data, filter]);

  if (achievements.isPending) {
    return (
      <div className="grid place-items-center py-16 text-text-soft">
        <Spinner />
      </div>
    );
  }
  if (achievements.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-okada">{errorMessage(achievements.error)}</p>
        <Button variant="paper" size="sm" onClick={() => void achievements.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const { unlocked, total, population } = achievements.data;
  const open = achievements.data.achievements.find((item) => item.id === openId) ?? null;
  const filters: readonly Filter[] = ['all', 'unlocked', ...ACHIEVEMENT_CATEGORIES];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card bg-ink p-3.5 text-on-ink">
        <p className="flex items-baseline justify-between">
          <span className="type-figure text-3xl">
            {unlocked}
            <span className="text-base text-on-ink-soft">/{total}</span>
          </span>
          <span className="text-xs text-on-ink-soft">Rarity across {population.toLocaleString('en-NG')} players</span>
        </p>
        <ProgressBar value={unlocked} max={total} label="Badges unlocked" className="mt-2 bg-white/15" />
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter badges">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
            className={cn('h-8 shrink-0 rounded-full px-3 text-xs font-bold', filter === item ? 'bg-ink text-on-ink' : 'bg-paper-2 text-text-soft hover:text-text')}
          >
            {item === 'all' ? 'All' : item === 'unlocked' ? 'Unlocked' : CATEGORY_LABELS[item]}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-soft">Nothing here yet. Go and live a little.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {list.map((achievement) => (
            <li key={achievement.id}>
              <AchievementTile achievement={achievement} onOpen={() => setOpenId(achievement.id)} />
            </li>
          ))}
        </ul>
      )}
      <AchievementSheet achievement={open} onClose={() => setOpenId(null)} />
    </div>
  );
}
