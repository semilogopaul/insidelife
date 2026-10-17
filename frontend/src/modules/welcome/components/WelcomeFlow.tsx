'use client';

import { useMemo } from 'react';
import { liveFeaturedPlaces, pendingAnnouncement } from '@insidelife/shared';
import { useSnapshot } from '@/common/game/snapshot';
import { useOnboarding } from '../hooks/use-onboarding';
import { pickPrompt } from '../services/pick-prompt';
import { AnnouncementPrompt } from './AnnouncementPrompt';
import { FeaturedPlacesPrompt } from './FeaturedPlacesPrompt';
import { WelcomeNote } from './WelcomeNote';

/** Mounted once in the game root: shows the welcome note, then the featured-places prompt, then the "What's new" announcement, each once per account. */
export function WelcomeFlow() {
  const hasCharacter = useSnapshot().data !== undefined;
  const { onboarding, answerWelcome, markFeaturedSeen, markAnnouncementSeen } = useOnboarding();
  const places = useMemo(() => liveFeaturedPlaces(), []);
  const prompt = pickPrompt(onboarding, hasCharacter, places);
  const announcement = pendingAnnouncement(onboarding?.lastAnnouncementSeen ?? null);
  return (
    <>
      <WelcomeNote open={prompt === 'welcome'} onAnswer={answerWelcome} />
      <FeaturedPlacesPrompt open={prompt === 'featured'} places={places} onDone={() => markFeaturedSeen()} />
      {announcement && <AnnouncementPrompt open={prompt === 'announcement'} announcement={announcement} onSeen={() => markAnnouncementSeen(announcement.id)} />}
    </>
  );
}
