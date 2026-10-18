import { describe, expect, it } from 'vitest';
import type { SuggestionDto } from '@insidelife/shared';
import { chipLabel, etaPhrase, isBookable, isRoutineDue, scheduleStart, suggestionActions } from '../services/suggestions';

const base: SuggestionDto = {
  id: 'need:hunger',
  kind: 'need',
  priority: 80,
  title: 'You’re hungry',
  body: 'Shitta Amala is 4 min away by danfo.',
  icon: 'utensils',
  actionId: 'eat-buka',
  target: { locationId: 'shitta-amala', name: 'Shitta Amala', venueType: 'buka', mode: 'danfo', etaMinutes: 4, fare: 600, openNow: true },
  goalId: null,
};

const label = (id: string): string | null => (id === 'eat-buka' ? 'Eat at the buka' : null);

describe('chip labels', () => {
  it('names the place and how far it is', () => {
    expect(chipLabel(base)).toBe('You’re hungry — Shitta Amala, 4 min away');
  });
  it('says when you are already there', () => {
    expect(chipLabel({ ...base, target: { ...base.target!, etaMinutes: 0 } })).toBe('You’re hungry — you’re at Shitta Amala');
  });
  it('falls back to the title without a target', () => {
    expect(chipLabel({ ...base, target: null })).toBe('You’re hungry');
  });
  it('phrases ETAs by mode', () => {
    expect(etaPhrase(4, 'danfo')).toBe('4 min by danfo');
    expect(etaPhrase(12, 'walk')).toBe('12 min on foot');
    expect(etaPhrase(9, 'brt')).toBe('9 min by BRT');
    expect(etaPhrase(0, 'car')).toBe('here');
  });
});

describe('suggestion actions', () => {
  it('offers directions and a ride (with fare) when the place is away', () => {
    const actions = suggestionActions(base, label);
    expect(actions.map((action) => action.kind)).toEqual(['directions', 'ride']);
    expect(actions[1]?.label).toBe('Take Danfo · ₦600');
  });
  it('offers the action itself when you are there', () => {
    const actions = suggestionActions({ ...base, target: { ...base.target!, etaMinutes: 0 } }, label);
    expect(actions).toEqual([{ kind: 'act', label: 'Eat at the buka', actionId: 'eat-buka' }]);
  });
  it('never books your own car or a trek', () => {
    expect(isBookable('car')).toBe(false);
    expect(isBookable('walk')).toBe(false);
    const actions = suggestionActions({ ...base, target: { ...base.target!, mode: 'car' } }, label);
    expect(actions.map((action) => action.kind)).toEqual(['directions']);
  });
  it('links goal suggestions to the Goals app', () => {
    const actions = suggestionActions({ ...base, kind: 'goal', actionId: null, target: null, goalId: 'step-outside' }, label);
    expect(actions).toEqual([{ kind: 'goals', label: 'See goal' }]);
  });
});

describe('routine prompts', () => {
  const work: SuggestionDto = { ...base, id: 'schedule:work:1000', kind: 'schedule', title: 'Work at 08:00', schedule: { kind: 'work', startsAt: 1000 } };
  it('reads the start time from the schedule block', () => {
    expect(scheduleStart(work)).toBe(1000);
    expect(scheduleStart(base)).toBeNull();
  });
  it('is due within one game hour, or when already late', () => {
    expect(isRoutineDue(work, 930)).toBe(false);
    expect(isRoutineDue(work, 940)).toBe(true);
    expect(isRoutineDue(work, 1010)).toBe(true);
  });
});

describe('route card', () => {
  it('shows on foot and hides behind the wheel', async () => {
    const { showRouteCard } = await import('../services/suggestions');
    expect(showRouteCard('venue', 'walking')).toBe(true);
    expect(showRouteCard('venue', 'driving')).toBe(false);
    expect(showRouteCard(null, 'walking')).toBe(false);
  });
});
