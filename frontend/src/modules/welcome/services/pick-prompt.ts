import type { FeaturedPlace, OnboardingDto } from '@insidelife/shared';

export type WelcomePrompt = 'welcome' | 'featured';

/**
 * Which one-time prompt to show now, if any. The welcome note comes first (new accounts only: the server marks older
 * accounts as seen); the featured-places prompt follows, and only while at least one featured venue exists. Nothing
 * shows before the character exists or before the server has answered.
 */
export function pickPrompt(onboarding: OnboardingDto | undefined, hasCharacter: boolean, livePlaces: readonly FeaturedPlace[]): WelcomePrompt | null {
  if (!onboarding || !hasCharacter) return null;
  if (!onboarding.welcomeSeen) return 'welcome';
  if (!onboarding.featuredSeen && livePlaces.length > 0) return 'featured';
  return null;
}
