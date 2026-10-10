'use client';

import { useMemo } from 'react';
import { liveFeaturedPlaces } from '@insidelife/shared';
import { useSnapshot } from '@/common/game/snapshot';
import { useOnboarding } from '../hooks/use-onboarding';
import { pickPrompt } from '../services/pick-prompt';
import { FeaturedPlacesPrompt } from './FeaturedPlacesPrompt';
import { WelcomeNote } from './WelcomeNote';

/** Mounted once in the game root: shows the welcome note, then the featured-places prompt, each once per account. */
export function WelcomeFlow() {
  const hasCharacter = useSnapshot().data !== undefined;
  const { onboarding, answerWelcome, markFeaturedSeen } = useOnboarding();
  const places = useMemo(() => liveFeaturedPlaces(), []);
  const prompt = pickPrompt(onboarding, hasCharacter, places);
  return (
    <>
      <WelcomeNote open={prompt === 'welcome'} onAnswer={answerWelcome} />
      <FeaturedPlacesPrompt open={prompt === 'featured'} places={places} onDone={() => markFeaturedSeen()} />
    </>
  );
}
