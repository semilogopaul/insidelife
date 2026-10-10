'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { liveFeaturedPlaces, type OnboardingDto, type TourOutcome } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { useSession } from '@/common/auth/session-store';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorld } from '@/common/game/world-store';
import { useStickSide, useTouchUi } from '@/common/hooks/use-touch-ui';
import { tourApi } from '../services/tour.api';
import { TOUR_STEPS, type TourContext, type TourStep } from '../services/steps';
import { IDLE, shouldAutoStart, tourReducer } from '../services/tour-state';

/** Shared with the welcome feature: one cache entry for `/account/onboarding`. */
const KEY = queryKeys.domain('onboarding');
/** Let the announcement sheet finish closing before the walkthrough starts. */
const START_DELAY_MS = 900;

export interface TourController {
  readonly running: boolean;
  readonly step: TourStep;
  readonly index: number;
  readonly total: number;
  readonly context: TourContext;
  next(): void;
  back(): void;
  skip(): void;
}

/**
 * The guided walkthrough: starts once per account after the welcome flow (or when the player replays it from Me),
 * puts the phone and the HUD where each step needs them, and records how it ended on the account.
 */
export function useTour(steps: readonly TourStep[] = TOUR_STEPS): TourController {
  const client = useQueryClient();
  const authenticated = useSession((state) => state.status === 'authenticated');
  const hasCharacter = useSnapshot().data !== undefined;
  const loading = useWorld((state) => state.mode === 'loading');
  const touch = useTouchUi();
  const stickSide = useStickSide();
  const tourRequest = useUi((state) => state.tourRequest);
  const query = useQuery({ queryKey: KEY, queryFn: tourApi.get, enabled: authenticated, staleTime: Number.POSITIVE_INFINITY });
  const places = useMemo(() => liveFeaturedPlaces(), []);
  const total = steps.length;
  const [state, dispatch] = useReducer((current: typeof IDLE, action: Parameters<typeof tourReducer>[1]) => tourReducer(current, action, total), IDLE);

  const record = useMutation({
    mutationFn: tourApi.done,
    onMutate: (outcome: TourOutcome) => client.setQueryData<OnboardingDto>(KEY, (current) => (current ? { ...current, tourOutcome: outcome } : current)),
    onSuccess: (dto) => client.setQueryData(KEY, dto),
  });

  // Start by itself, once: the server's answer decides (another device that finished it counts too).
  const eligible = shouldAutoStart(query.data, hasCharacter, places.length > 0) && !loading;
  useEffect(() => {
    if (!eligible || state.phase !== 'idle') return;
    const id = window.setTimeout(() => dispatch({ type: 'start', replay: false }), START_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [eligible, state.phase]);

  // "Replay the walkthrough" in Me → Settings.
  const seenRequest = useRef(tourRequest);
  useEffect(() => {
    if (tourRequest === seenRequest.current) return;
    seenRequest.current = tourRequest;
    dispatch({ type: 'start', replay: true });
  }, [tourRequest]);

  // What the player had before the walkthrough moved things around, put back when it ends.
  const before = useRef<{ readonly hudHidden: boolean } | null>(null);
  const step = steps[Math.min(state.index, total - 1)] as TourStep;
  const running = state.phase === 'running';
  useEffect(() => {
    if (!running) return;
    const { settings, updateSettings, openPhone, closePhone } = useUi.getState();
    before.current ??= { hudHidden: settings.hudHidden };
    // Steps that point at the HUD need it on screen (the clean screen may have hidden it); the clean-screen demo hides it.
    const hidden = step.hudHidden === true;
    if (settings.hudHidden !== hidden) updateSettings({ hudHidden: hidden });
    if (step.phone) openPhone(step.phone.app, step.phone.param ?? null);
    else closePhone();
  }, [running, step]);

  useEffect(() => {
    if (state.phase !== 'done') return;
    const { updateSettings, closePhone } = useUi.getState();
    closePhone();
    if (before.current) updateSettings({ hudHidden: before.current.hudHidden });
    before.current = null;
    if (!state.replay && state.outcome) record.mutate(state.outcome);
    dispatch({ type: 'reset' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `record` changes every render; the run ends once
  }, [state.phase]);

  const next = useCallback(() => dispatch({ type: 'next' }), []);
  const back = useCallback(() => dispatch({ type: 'back' }), []);
  const skip = useCallback(() => dispatch({ type: 'skip' }), []);
  return { running, step, index: state.index, total, context: { touch, stickSide }, next, back, skip };
}
