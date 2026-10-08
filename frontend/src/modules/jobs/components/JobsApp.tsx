'use client';

import { useState } from 'react';
import { Tabs } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { useEmployment, useJobBoard } from '../hooks/use-jobs-data';
import { ApplicationsTab } from './applications/ApplicationsTab';
import { JobBoardTab } from './board/JobBoardTab';
import { BusinessTab } from './business/BusinessTab';
import { MyJobTab } from './my-job/MyJobTab';

type JobsTab = 'my-job' | 'board' | 'applications' | 'business';
const TABS: readonly JobsTab[] = ['my-job', 'board', 'applications', 'business'];
const isTab = (value: string | null): value is JobsTab =>
  value !== null && (TABS as readonly string[]).includes(value);
const TAB_LABELS: Record<JobsTab, string> = {
  'my-job': 'My job',
  board: 'Board',
  applications: 'Applied',
  business: 'Business',
};

/** Jobs phone app: your job, the board, applications and your businesses. Deep link: openPhone('jobs', '<tab>'). */
export function JobsApp() {
  const deepLink = useUi((state) => state.phoneParam);
  const [chosen, setChosen] = useState<JobsTab | null>(isTab(deepLink) ? deepLink : null);
  const employment = useEmployment();
  const board = useJobBoard();
  const tab: JobsTab = chosen ?? (employment.data?.employment ? 'my-job' : 'board');
  const openApplications =
    board.data?.applications.filter(
      (application) => application.status === 'pending' || application.status === 'interview',
    ).length ?? 0;
  const browse = (): void => setChosen('board');

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-5 bg-paper px-5 pb-2">
        <Tabs
          label="Jobs"
          value={tab}
          onChange={setChosen}
          items={[
            { id: 'my-job', label: TAB_LABELS['my-job'] },
            { id: 'board', label: TAB_LABELS.board },
            { id: 'applications', label: TAB_LABELS.applications, badge: openApplications },
            { id: 'business', label: TAB_LABELS.business },
          ]}
        />
      </div>
      <div role="tabpanel" aria-label={TAB_LABELS[tab]}>
        {tab === 'my-job' && <MyJobTab onBrowse={browse} />}
        {tab === 'board' && <JobBoardTab />}
        {tab === 'applications' && <ApplicationsTab onBrowse={browse} />}
        {tab === 'business' && <BusinessTab />}
      </div>
    </div>
  );
}
