import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findVenue, type NightOutDto, type NightOutOfferDto, type NightOutSection } from '@insidelife/shared';
import type * as NightOut from '@/common/night-out';
import { NightOutPanel } from '../components/night-out/NightOutPanel';

const state = vi.hoisted(() => ({ menu: null as unknown, mutate: vi.fn() }));

vi.mock('@/common/night-out', async (importOriginal) => {
  const actual = await importOriginal<typeof NightOut>();
  return { ...actual, useNightOut: () => ({ data: state.menu, isPending: false, isError: false, error: null, refetch: vi.fn() }) };
});
vi.mock('../hooks/use-night-out-buy', () => ({ useBuyNightOut: () => ({ mutate: state.mutate, isPending: false }) }));

const offer = (overrides: Partial<NightOutOfferDto>): NightOutOfferDto => ({
  id: 'champagne',
  section: 'bottles',
  kind: 'bottle',
  label: 'Champagne',
  emoji: '🍾',
  blurb: 'Gold foil and a sparkler.',
  shows: 'A sparkler bottle lands on their table',
  price: 353_000,
  clout: 3,
  durationMs: 10_000,
  target: 'required',
  leftTonight: 6,
  unavailable: null,
  ...overrides,
});

const menu = (overrides: Partial<NightOutDto> = {}): NightOutDto => ({
  venueId: 'quilox',
  venueName: 'Quilox',
  serverNow: 0,
  closedReason: null,
  offers: [
    offer({}),
    offer({ id: 'shoutout-basic', section: 'shoutout', kind: 'shoutout', label: 'Shoutout', emoji: '🎤', price: 50_000, target: 'none', durationMs: 8_000 }),
    offer({ id: 'shoutout-odogwu', section: 'shoutout', kind: 'shoutout', label: 'Odogwu shoutout', emoji: '👑', price: 1_000_000, target: 'none', durationMs: 25_000 }),
    offer({ id: 'confetti-cannon', section: 'experiences', kind: 'confetti-cannon', label: 'Confetti cannon', emoji: '🎊', price: 300_000, target: 'none' }),
    offer({ id: 'vip-section', section: 'experiences', kind: 'vip-section', label: 'Reserve the VIP section', emoji: '🛋️', price: 2_500_000, target: 'none', durationMs: 0, unavailable: '@ada has the VIP section tonight' }),
  ],
  moments: [],
  vip: null,
  you: { adult: true, cash: 5_000_000, momentsTonight: 2, momentsLeftTonight: 22, cloutTonight: 4, queuedShoutoutAt: null },
  ...overrides,
});

function Harness({ initial = 'bottles', cash = 5_000_000 }: { readonly initial?: NightOutSection; readonly cash?: number }) {
  const [section, setSection] = useState<NightOutSection>(initial);
  return (
    <NightOutPanel
      venue={findVenue('quilox')!}
      people={[{ handle: 'femi', firstName: 'Femi', lastName: 'Bello', isFriend: true }]}
      me={{ id: 'me-id', handle: 'tolu', firstName: 'Tolu' }}
      cash={cash}
      section={section}
      onSectionChange={setSection}
    />
  );
}

beforeEach(() => {
  state.menu = menu();
  state.mutate.mockReset();
});

describe('NightOutPanel', () => {
  it('sends a bottle to the person you pick', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: /Send Champagne/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Pick who it’s for')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Femi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send Champagne to Femi · ₦353,000' }));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'champagne', toHandle: 'femi', message: null, idempotencyKey: expect.any(String) }), expect.anything());
  });

  it('buys a shoutout with your message and previews your name', () => {
    render(<Harness initial="shoutout" />);
    expect(screen.getAllByText('@tolu').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Birthday babe in the building!' } });
    fireEvent.click(screen.getByRole('radio', { name: /Odogwu shoutout/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Shout out · ₦1,000,000' }));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'shoutout-odogwu', toHandle: null, message: 'Birthday babe in the building!' }), expect.anything());
  });

  it('shows why something is off: the VIP section taken, not enough cash', () => {
    render(<Harness initial="experiences" cash={100_000} />);
    expect(screen.getAllByText('You need ₦300,000 cash on you — you have ₦100,000').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: /Reserve the VIP section/ }));
    expect(screen.getAllByText('@ada has the VIP section tonight').length).toBeGreaterThan(1);
    expect((screen.getByRole('button', { name: /Book reserve the vip section/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes the menu for under-18s and says so', () => {
    state.menu = menu({ closedReason: 'Clubs and bars are 18+. Your time go reach.', you: { ...menu().you, adult: false } });
    render(<Harness />);
    expect(screen.getByRole('alert').textContent).toContain('18+');
    fireEvent.click(screen.getByRole('radio', { name: /Femi/ }));
    expect((screen.getByRole('button', { name: /Send Champagne/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
