import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingDto } from '@insidelife/shared';
import { useUi } from '@/common/game/ui-store';
import { TourCard } from '../components/Tour';
import { findTarget } from '../hooks/use-target';
import { placeCard } from '../services/layout';
import { TOUR_STEPS } from '../services/steps';
import { IDLE, shouldAutoStart, tourReducer, type TourAction, type TourState } from '../services/tour-state';

const NEW: OnboardingDto = { welcomeSeen: true, welcomeReaction: 'na-you-sabi', featuredSeen: true, tourOutcome: null };
const total = TOUR_STEPS.length;
const run = (actions: readonly TourAction[], from: TourState = IDLE): TourState => actions.reduce((state, action) => tourReducer(state, action, total), from);
const rect = (top: number, left: number, width: number, height: number): DOMRect => ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) });

describe('tour sequencing', () => {
  it('walks the steps in order and completes after the last Next', () => {
    let state = run([{ type: 'start', replay: false }]);
    expect(state).toMatchObject({ phase: 'running', index: 0 });
    state = run(Array.from({ length: total - 1 }, () => ({ type: 'next' }) as const), state);
    expect(state).toMatchObject({ phase: 'running', index: total - 1 });
    state = run([{ type: 'next' }], state);
    expect(state).toMatchObject({ phase: 'done', outcome: 'completed' });
  });

  it('Back stops at the first step; Skip ends with the skipped outcome', () => {
    const state = run([{ type: 'start', replay: false }, { type: 'next' }, { type: 'back' }, { type: 'back' }]);
    expect(state.index).toBe(0);
    expect(run([{ type: 'skip' }], state)).toMatchObject({ phase: 'done', outcome: 'skipped' });
  });

  it('covers every topic, in order, with a stable target on each step', () => {
    expect(TOUR_STEPS.map((step) => step.id)).toEqual(['move', 'car', 'map-app', 'map-place', 'map-go', 'map-ride', 'goals-pill', 'goals-app', 'clean-hide', 'clean-show', 'motors', 'homes', 'promote']);
    expect(TOUR_STEPS.every((step) => step.targets.length > 0)).toBe(true);
  });

  it('names the stick side on touch and the keys on a keyboard', () => {
    const move = TOUR_STEPS[0]!;
    expect(move.body({ touch: true, stickSide: 'left' })).toMatch(/left thumb on the ring/);
    expect(move.body({ touch: false, stickSide: null })).toMatch(/W A S D/);
  });
});

describe('once-only logic', () => {
  it('starts only after the welcome flow, once, for accounts that have not finished it', () => {
    expect(shouldAutoStart(NEW, true, true)).toBe(true);
    expect(shouldAutoStart({ ...NEW, welcomeSeen: false }, true, true)).toBe(false);
    expect(shouldAutoStart({ ...NEW, featuredSeen: false }, true, true)).toBe(false);
    expect(shouldAutoStart({ ...NEW, featuredSeen: false }, true, false)).toBe(true);
    expect(shouldAutoStart({ ...NEW, tourOutcome: 'completed' }, true, true)).toBe(false);
    expect(shouldAutoStart({ ...NEW, tourOutcome: 'skipped' }, true, true)).toBe(false);
    expect(shouldAutoStart(undefined, true, true)).toBe(false);
    expect(shouldAutoStart(NEW, false, true)).toBe(false);
  });

  it('a replay is flagged so it never writes to the account', () => {
    const state = run([{ type: 'start', replay: true }, { type: 'skip' }]);
    expect(state).toMatchObject({ phase: 'done', replay: true, outcome: 'skipped' });
  });

  it('the Me → Settings replay request bumps the store counter and closes the phone', () => {
    const { result } = renderHook(() => useUi());
    const before = result.current.tourRequest;
    act(() => result.current.openPhone('me'));
    act(() => result.current.requestTour());
    expect(result.current.tourRequest).toBe(before + 1);
    expect(result.current.phoneOpen).toBe(false);
  });
});

describe('targets', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds an element that is on screen and ignores missing ones', () => {
    const el = document.createElement('div');
    el.dataset.tour = 'hud-hide';
    el.getBoundingClientRect = () => rect(10, 10, 40, 40);
    document.body.append(el);
    const viewport = { width: 390, height: 844 };
    expect(findTarget(['hud-hide'], viewport)?.element).toBe(el);
    expect(findTarget(['nope', 'hud-hide'], viewport)?.element).toBe(el);
    expect(findTarget(['nope'], viewport)).toBeNull();
  });

  it('centres the card when there is no target, and places it under or over a target', () => {
    const viewport = { width: 390, height: 844 };
    expect(placeCard(null, viewport, 200).mode).toBe('centred');
    expect(placeCard({ top: 20, left: 300, width: 40, height: 40 }, viewport, 200).mode).toBe('below');
    expect(placeCard({ top: 700, left: 20, width: 100, height: 100 }, viewport, 200).mode).toBe('above');
    const edge = placeCard({ top: 20, left: 300, width: 40, height: 40 }, viewport, 200);
    expect(edge.left + edge.width).toBeLessThanOrEqual(viewport.width);
  });
});

describe('TourCard', () => {
  function controller(index: number) {
    return { running: true, step: TOUR_STEPS[index]!, index, total, context: { touch: false, stickSide: null }, next: vi.fn(), back: vi.fn(), skip: vi.fn() };
  }
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('with a missing target: shows the step count centred, takes focus, and Next / Back / Skip / Esc work', async () => {
    const tour = controller(1);
    render(<TourCard tour={tour} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });
    const card = screen.getByRole('dialog', { name: /Step 2 of 13: Cars: in and out/ });
    expect(screen.getByTestId('tour').dataset.target).toBe('missing');
    expect(card.dataset.placement).toBe('centred');
    expect(document.activeElement).toBe(card);
    expect(screen.getByText('2 of 13')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(tour.next).toHaveBeenCalledTimes(1);
    expect(tour.back).toHaveBeenCalledTimes(1);
    expect(tour.skip).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tour.skip).toHaveBeenCalledTimes(2);
  });

  it('points at the real element when it is on screen', async () => {
    const el = document.createElement('button');
    el.dataset.tour = 'hud-hide';
    el.getBoundingClientRect = () => rect(12, 320, 44, 44);
    document.body.append(el);
    render(<TourCard tour={controller(TOUR_STEPS.findIndex((step) => step.id === 'clean-hide'))} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByTestId('tour').dataset.target).toBe('found');
    expect(screen.getByRole('dialog').dataset.placement).toBe('below');
  });

  it('the last step offers Done', async () => {
    render(<TourCard tour={controller(total - 1)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });
});
