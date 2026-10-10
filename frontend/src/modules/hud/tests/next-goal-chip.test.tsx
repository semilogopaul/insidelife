import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalGuide } from '@/common/goal-guide';
import { useUi } from '@/common/game/ui-store';
import { NextGoalChip } from '../components/NextGoalChip';

const place = {
  kind: 'goal-place',
  goalId: 'g1',
  goalTitle: 'Pass JAMB',
  text: 'Go to Yaba CBT Centre',
  venueId: 'cbt-yaba',
  venueName: 'Yaba CBT Centre',
  point: { x: 0, z: 0 },
  metres: 2100,
} as const;

const guide = (over: Partial<GoalGuide> = {}): GoalGuide => ({ step: place, isGoal: true, title: 'Pass JAMB', navigating: false, go: vi.fn(), openGoals: vi.fn(), ...over });

describe('NextGoalChip', () => {
  beforeEach(() => useUi.setState({ phoneOpen: false }));

  it('shows the goal, the next step and its distance', () => {
    render(<NextGoalChip guide={guide()} compact={false} />);
    expect(screen.getByText('Pass JAMB')).toBeTruthy();
    expect(screen.getByText('Go to Yaba CBT Centre · 2.1 km')).toBeTruthy();
  });

  it('Go runs the step; tapping the card opens Goals', () => {
    const g = guide();
    render(<NextGoalChip guide={g} compact={false} />);
    fireEvent.click(screen.getByRole('button', { name: /^Go:/ }));
    expect(g.go).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Open Goals$/ }));
    expect(g.openGoals).toHaveBeenCalledOnce();
  });

  it('says On it while GPS is already set to the place', () => {
    render(<NextGoalChip guide={guide({ navigating: true })} compact={false} />);
    expect(screen.getByRole('button', { name: /^On it:/ })).toBeTruthy();
  });

  it('is one line when compact and labelled as an idea when it is not a goal', () => {
    const idea = { kind: 'suggestion', title: 'Find work', text: 'Open Jobs', venueId: null, venueName: null, point: null, metres: null, app: 'jobs' } as const;
    render(<NextGoalChip guide={guide({ step: idea, isGoal: false, title: 'Find work' })} compact />);
    expect(screen.queryByText('Something to do')).toBeNull();
    expect(screen.getByRole('button', { name: /^Open:/ })).toBeTruthy();
  });

  it('renders nothing without a step', () => {
    const { container } = render(<NextGoalChip guide={guide({ step: null })} compact={false} />);
    expect(container.firstChild).toBeNull();
  });
});
