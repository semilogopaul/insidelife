import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeaturedPlace, OnboardingDto } from '@insidelife/shared';

vi.mock('@/common/travel/travel-quotes', () => ({ useTravelQuotes: () => ({ data: [], isPending: false }) }));
vi.mock('@/common/game/snapshot', () => ({ useSnapshot: () => ({ data: {} }) }));
vi.mock('../services/onboarding.api', () => ({
  onboardingApi: { get: vi.fn(), answerWelcome: vi.fn(), featuredSeen: vi.fn() },
}));
// The two featured venues don't exist yet: the real catalog has neither.
const shared = await import('@insidelife/shared');

import { useSession } from '@/common/auth/session-store';
import { onboardingApi } from '../services/onboarding.api';
import { FeaturedPlacesPrompt } from '../components/FeaturedPlacesPrompt';
import { WelcomeFlow } from '../components/WelcomeFlow';
import { WelcomeNote } from '../components/WelcomeNote';
import { pickPrompt } from '../services/pick-prompt';

const NEW_PLAYER: OnboardingDto = { welcomeSeen: false, welcomeReaction: null, featuredSeen: false, tourOutcome: null };
const PLACES: readonly FeaturedPlace[] = [{ venueId: 'iya-basira', name: 'Iya Basira' }];

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('pickPrompt (once-only order)', () => {
  it('shows the welcome note first, only to accounts that have not seen it', () => {
    expect(pickPrompt(NEW_PLAYER, true, PLACES)).toBe('welcome');
    expect(pickPrompt({ ...NEW_PLAYER, welcomeSeen: true }, true, PLACES)).toBe('featured');
  });

  it('never shows a prompt again once it was seen', () => {
    expect(pickPrompt({ welcomeSeen: true, welcomeReaction: 'na-you-sabi', featuredSeen: true, tourOutcome: null }, true, PLACES)).toBeNull();
  });

  it('waits for the character and the server', () => {
    expect(pickPrompt(undefined, true, PLACES)).toBeNull();
    expect(pickPrompt(NEW_PLAYER, false, PLACES)).toBeNull();
  });

  it('skips the featured prompt while none of the places exist', () => {
    expect(pickPrompt({ ...NEW_PLAYER, welcomeSeen: true }, true, [])).toBeNull();
  });
});

describe('WelcomeNote', () => {
  it('has the team note without any names and both answers', () => {
    const onAnswer = vi.fn();
    render(<WelcomeNote open onAnswer={onAnswer} />);
    expect(screen.getByText(/We built Inside Life to be super fun and immersive/)).toBeTruthy();
    expect(screen.getByText(/Much love/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'I dey for you' }));
    expect(onAnswer).toHaveBeenCalledWith('i-dey-for-you');
    fireEvent.click(screen.getByRole('button', { name: 'Na you sabi' }));
    expect(onAnswer).toHaveBeenLastCalledWith('na-you-sabi');
  });
});

describe('FeaturedPlacesPrompt', () => {
  it('only announces the places it is given (no travel options) and closes on Got it', () => {
    const onDone = vi.fn();
    render(wrap(<FeaturedPlacesPrompt open places={[{ venueId: 'obo-mansion', name: 'OBO Mansion' }]} onDone={onDone} />));
    expect(screen.getByRole('heading', { name: 'OBO Mansion is now live!' })).toBeTruthy();
    expect(screen.queryByText('Dangote Refinery')).toBeNull();
    expect(screen.queryByRole('button', { name: /Walk there with GPS/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('renders nothing when no place exists', () => {
    const { container } = render(wrap(<FeaturedPlacesPrompt open places={[]} onDone={() => undefined} />));
    expect(container.textContent).toBe('');
  });
});

describe('WelcomeFlow', () => {
  beforeEach(() => {
    useSession.setState({ status: 'authenticated' } as never);
    vi.mocked(onboardingApi.get).mockResolvedValue(NEW_PLAYER);
    vi.mocked(onboardingApi.answerWelcome).mockResolvedValue({ welcomeSeen: true, welcomeReaction: 'na-you-sabi', featuredSeen: false, tourOutcome: null });
  });

  it('shows the note once, records the answer on the server, and stays closed', async () => {
    render(wrap(<WelcomeFlow />));
    fireEvent.click(await screen.findByRole('button', { name: 'Na you sabi' }));
    await waitFor(() => expect(vi.mocked(onboardingApi.answerWelcome).mock.calls[0]?.[0]).toBe('na-you-sabi'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Na you sabi' })).toBeNull());
    // The featured venues are not in the catalog yet, so no second prompt appears.
    expect(shared.liveFeaturedPlaces()).toEqual([]);
    expect(screen.queryByText(/are now live/)).toBeNull();
  });
});
