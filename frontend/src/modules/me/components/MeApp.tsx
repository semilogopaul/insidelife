'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { Button, Section, Tabs } from '@/common/components';
import { useSignOut } from '@/common/auth/use-sign-out';
import { useSnapshot } from '@/common/game/snapshot';
import { InstallAppPanel } from '@/common/pwa';
import { DeleteAccount } from './DeleteAccount';
import { EmailSettings } from './EmailSettings';
import { GameSettings } from './GameSettings';
import { HabitsPanel } from './HabitsPanel';
import { LeaderboardsPanel } from './LeaderboardsPanel';
import { LifestylePicker } from './LifestylePicker';
import { ReplayTour } from './ReplayTour';
import { PrivacySettings } from './PrivacySettings';
import { ProfileCard } from './ProfileCard';

type MeTab = 'profile' | 'habits' | 'ranks' | 'settings';

/** Me: your profile card and lifestyle, daily habits, Lagos leaderboards, and account, privacy, device and install settings. */
export function MeApp() {
  const { data: snapshot } = useSnapshot();
  const [tab, setTab] = useState<MeTab>('profile');
  const signOut = useSignOut();
  if (!snapshot) return null;
  const character = snapshot.character;

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        label="Me sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'profile', label: 'Profile' },
          { id: 'habits', label: 'Habits' },
          { id: 'ranks', label: 'Rankings' },
          { id: 'settings', label: 'Settings' },
        ]}
      />
      {tab === 'profile' && (
        <div className="flex flex-col gap-5">
          <ProfileCard character={character} />
          <LifestylePicker current={character.lifestyle} />
        </div>
      )}
      {tab === 'habits' && <HabitsPanel character={character} />}
      {tab === 'ranks' && <LeaderboardsPanel characterId={character.id} />}
      {tab === 'settings' && (
        <div className="flex flex-col gap-6">
          <Section title="Account">
            <EmailSettings />
          </Section>
          <Section title="Privacy">
            <PrivacySettings />
          </Section>
          <Section title="Game settings">
            <GameSettings />
          </Section>
          <Section title="Walkthrough">
            <ReplayTour />
          </Section>
          <Section title="App">
            <InstallAppPanel />
          </Section>
          <Button variant="paper" icon={<LogOut size={18} aria-hidden />} onClick={() => signOut.mutate()} loading={signOut.isPending}>
            Sign out
          </Button>
          <Section title="Delete account">
            <DeleteAccount />
          </Section>
        </div>
      )}
    </div>
  );
}
