'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OnboardingDto, WelcomeReaction } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { useSession } from '@/common/auth/session-store';
import { onboardingApi } from '../services/onboarding.api';

const KEY = queryKeys.domain('onboarding');

/** Which one-time prompts this account has seen (kept on the server, so another device doesn't repeat them). */
export function useOnboarding() {
  const client = useQueryClient();
  const authenticated = useSession((state) => state.status === 'authenticated');
  const query = useQuery({ queryKey: KEY, queryFn: onboardingApi.get, enabled: authenticated, staleTime: Number.POSITIVE_INFINITY });

  // Close the prompt at once; the server's answer replaces the guess.
  const update = (patch: Partial<OnboardingDto>): void => {
    client.setQueryData<OnboardingDto>(KEY, (current) => (current ? { ...current, ...patch } : current));
  };
  const answerWelcome = useMutation({
    mutationFn: onboardingApi.answerWelcome,
    onMutate: (reaction: WelcomeReaction) => update({ welcomeSeen: true, welcomeReaction: reaction }),
    onSuccess: (dto) => client.setQueryData(KEY, dto),
  });
  const featuredSeen = useMutation({
    mutationFn: onboardingApi.featuredSeen,
    onMutate: () => update({ featuredSeen: true }),
    onSuccess: (dto) => client.setQueryData(KEY, dto),
  });
  const announcementSeen = useMutation({
    mutationFn: onboardingApi.announcementSeen,
    onMutate: (id: string) => update({ lastAnnouncementSeen: id }),
    onSuccess: (dto) => client.setQueryData(KEY, dto),
  });
  return { onboarding: query.data, answerWelcome: answerWelcome.mutate, markFeaturedSeen: featuredSeen.mutate, markAnnouncementSeen: announcementSeen.mutate };
}
