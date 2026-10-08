'use client';

import { useState } from 'react';
import { Tabs } from '@/common/components';
import { useProgression } from '../hooks/use-goals';
import { AchievementsTab } from './AchievementsTab';
import { GoalsTab } from './GoalsTab';

type GoalsTabId = 'goals' | 'badges';

/** Goals phone app: Life Goals by chapter, the daily welcome, and the badge wall. */
export function GoalsApp() {
  const [tab, setTab] = useState<GoalsTabId>('goals');
  const progression = useProgression();
  const badgeCount = progression.data ? `${progression.data.achievements.unlocked}/${progression.data.achievements.total}` : null;
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        label="Goals sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'goals', label: 'Life Goals' },
          { id: 'badges', label: badgeCount ? `Badges ${badgeCount}` : 'Badges' },
        ]}
      />
      <div role="tabpanel" aria-label={tab === 'goals' ? 'Life Goals' : 'Badges'}>
        {tab === 'goals' ? <GoalsTab /> : <AchievementsTab />}
      </div>
    </div>
  );
}
