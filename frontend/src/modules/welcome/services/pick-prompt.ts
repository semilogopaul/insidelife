import { pendingAnnouncement, type FeaturedPlace, type OnboardingDto } from '@insidelife/shared';

export type WelcomePrompt = 'welcome' | 'featured' | 'announcement';

/**
 * Which one-time prompt to show now, if any. The welcome note comes first (new accounts only: the server marks older
 * accounts as seen); the featured-places prompt follows, and only while at least one featured venue exists. Nothing
 * shows before the character exists or before the server has answered. The "What's new" announcement comes last: only
 * once the walkthrough has ended, so it never interrupts onboarding (it shows to existing accounts too).
 */
export function pickPrompt(onboarding: OnboardingDto | undefined, hasCharacter: boolean, livePlaces: readonly FeaturedPlace[]): WelcomePrompt | null {
  if (!onboarding || !hasCharacter) return null;
  if (!onboarding.welcomeSeen) return 'welcome';
  if (!onboarding.featuredSeen && livePlaces.length > 0) return 'featured';
  if (onboarding.tourOutcome !== null && pendingAnnouncement(onboarding.lastAnnouncementSeen) !== null) return 'announcement';
  return null;
}
