'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toDateParts, type ProgressionOverviewDto, type SuggestionDto, type WorldPoint } from '@insidelife/shared';
import { useEffect, useMemo, useRef } from 'react';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';
import { toast } from '@/common/components';
import { gameClock } from '@/common/game/game-clock';
import { gameEvents } from '@/common/game/game-events';
import { useGoalMarker } from '@/common/game/goal-marker-store';
import { useNavigation } from '@/common/game/navigation-store';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorld } from '@/common/game/world-store';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { playerPoint } from './directions';
import { doneKeys, newlyDone, nextGoalStep, stepAction, suggestSomething, type NextStep } from './next-step';

/** Same cache entry as the Goals app (`goalsApi.overview`). */
const progressionKey = queryKeys.domain('progression');

const NO_SUGGESTIONS: readonly SuggestionDto[] = [];

/** Player position in 20 m cells, so the chip re-renders on real movement, not every pose tick. */
function useCell(): string | null {
  return useWorld((state) => (state.position ? `${Math.round(state.position.x / 20)},${Math.round(state.position.z / 20)}` : null));
}

export interface GoalGuide {
  /** The next goal step, or a suggestion when there is none; null until the data is in. */
  readonly step: NextStep | null;
  /** True when `step` is a Life Goal step (not a suggestion). */
  readonly isGoal: boolean;
  /** Title of the goal, or of the suggestion. */
  readonly title: string;
  /** The step is a place and GPS is already set to it. */
  readonly navigating: boolean;
  /** Run the step's action: GPS to its place, or open the app it belongs to. */
  readonly go: () => void;
  readonly openGoals: () => void;
}

/**
 * The always-on "what do I do next?" answer: the current Life Goal's next step (or a suggestion), the goal marker for
 * the minimap, and a short toast when a step completes.
 */
export function useGoalGuide(suggestionList: readonly SuggestionDto[] | undefined): GoalGuide {
  const suggestions = suggestionList ?? NO_SUGGESTIONS;
  const client = useQueryClient();
  const { data: snapshot } = useSnapshot();
  const progression = useQuery({
    queryKey: progressionKey,
    queryFn: () => api.get<ProgressionOverviewDto>('/progression'),
    staleTime: 15_000,
    // Realtime notifications already refetch it the moment something lands; this is only a slow safety net (server load
    // at tens of thousands of players).
    refetchInterval: 180_000,
    refetchIntervalInBackground: false,
    enabled: snapshot !== undefined,
  });
  const cell = useCell();
  const destinationId = useNavigation((state) => state.destinationId);
  const setDestination = useNavigation((state) => state.setDestination);
  const openPhone = useUi((state) => state.openPhone);

  // A goal can complete on any server event: refresh when the server says something happened.
  useRealtimeEvent('notification', () => void client.invalidateQueries({ queryKey: progressionKey }));

  const goals = progression.data?.activeGoals;
  const completed = progression.data?.completedGoals;
  const character = snapshot?.character;
  const from: WorldPoint | null = useMemo(() => {
    if (!character) return null;
    void cell;
    return playerPoint({
      live: useWorld.getState().position,
      locationId: character.locationId,
      characterId: character.id,
      homePropertyId: character.homePropertyId,
      homeDistrictId: character.homeDistrictId,
    });
  }, [character, cell]);

  const hour = toDateParts(gameClock.now()).hour;
  const goalStep = useMemo(() => (goals && from ? nextGoalStep(goals, from, hour) : null), [goals, from, hour]);
  const step: NextStep | null = useMemo(() => {
    if (!from || !progression.data) return null;
    return goalStep ?? suggestSomething(suggestions, from);
  }, [goalStep, from, suggestions, progression.data]);

  // Minimap marker for the goal's place.
  const markerPoint = step?.kind === 'goal-place' ? step.point : null;
  const markerName = step?.kind === 'goal-place' ? step.venueName : null;
  useEffect(() => {
    useGoalMarker.getState().set(markerPoint, markerName);
    return () => useGoalMarker.getState().set(null);
  }, [markerPoint, markerName]);

  // Celebrate steps that finish: a goal completed or a goal path met, then the chip moves on by itself.
  const previous = useRef<ReadonlySet<string> | null>(null);
  const titles = useRef<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    if (!goals || !completed) return;
    const all = [...goals, ...completed];
    titles.current = new Map(all.map((goal) => [goal.id, goal.title]));
    const now = doneKeys(all);
    const before = previous.current;
    previous.current = now;
    if (!before) return;
    const fresh = newlyDone(before, now);
    if (fresh.length === 0) return;
    const key = fresh.find((entry) => entry.startsWith('goal:')) ?? fresh[0];
    const goalId = key?.startsWith('goal:') ? key.slice(5) : key?.split(':')[1];
    const label = goalId ? titles.current.get(goalId) : undefined;
    const next = goalStep && goalStep.kind !== 'suggestion' ? goalStep.goalTitle : null;
    gameEvents.emit('sfx', { id: 'ui-success' });
    toast({ title: key?.startsWith('goal:') ? 'Goal done!' : 'Step done!', body: `${label ?? 'Nice one'}${next ? ` — next: ${next}` : ''}`, tone: 'good' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- celebrate on data change only
  }, [goals, completed]);

  const openGoals = (): void => {
    gameEvents.emit('sfx', { id: 'ui-open' });
    openPhone('goals');
  };

  const go = (): void => {
    if (!step) return;
    const action = stepAction(step);
    if (action.type === 'gps') {
      setDestination(action.venueId, action.venueName);
      gameEvents.emit('sfx', { id: 'ui-success' });
      return;
    }
    gameEvents.emit('sfx', { id: 'ui-open' });
    openPhone(action.app);
  };

  const venueId = step?.kind === 'goal-place' || step?.kind === 'suggestion' ? step.venueId : null;
  return {
    step,
    isGoal: step !== null && step.kind !== 'suggestion',
    title: step ? (step.kind === 'suggestion' ? step.title : step.goalTitle) : '',
    navigating: venueId !== null && destinationId === venueId,
    go,
    openGoals,
  };
}
