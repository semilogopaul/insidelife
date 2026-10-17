import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANNOUNCEMENTS, type OnboardingDto } from '@insidelife/shared';
import { useUi } from '@/common/game/ui-store';
import { AnnouncementPrompt } from '../components/AnnouncementPrompt';
import { pickPrompt } from '../services/pick-prompt';

const DONE: OnboardingDto = { welcomeSeen: true, welcomeReaction: 'na-you-sabi', featuredSeen: true, tourOutcome: 'completed', lastAnnouncementSeen: null };
const announcement = ANNOUNCEMENTS[0]!;

describe('pickPrompt with announcements', () => {
  it('shows the announcement to existing accounts once onboarding is over', () => {
    expect(pickPrompt(DONE, true, [])).toBe('announcement');
    expect(pickPrompt({ ...DONE, tourOutcome: 'skipped' }, true, [])).toBe('announcement');
  });
  it('never interrupts onboarding', () => {
    expect(pickPrompt({ ...DONE, welcomeSeen: false }, true, [])).toBe('welcome');
    expect(pickPrompt({ ...DONE, featuredSeen: false }, true, [{ venueId: 'iya-basira', name: 'Iya Basira' }])).toBe('featured');
    expect(pickPrompt({ ...DONE, tourOutcome: null }, true, [])).toBeNull();
  });
  it('is shown once', () => {
    expect(pickPrompt({ ...DONE, lastAnnouncementSeen: announcement.id }, true, [])).toBeNull();
  });
});

describe('AnnouncementPrompt', () => {
  beforeEach(() => useUi.setState({ phoneOpen: false } as never));

  it('has the copy and all four buttons', () => {
    render(<AnnouncementPrompt open announcement={announcement} onSeen={() => undefined} />);
    expect(screen.getByText(/Own your own private jet/)).toBeTruthy();
    expect(screen.getByText(/Race your friends to Abuja/)).toBeTruthy();
    for (const name of ['Open Hangar', 'Book a flight', 'Race a friend', 'Top up']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });

  it('records it as seen and deep-links the race screen', () => {
    const openPhone = vi.fn();
    useUi.setState({ openPhone } as never);
    const onSeen = vi.fn();
    render(<AnnouncementPrompt open announcement={announcement} onSeen={onSeen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Race a friend' }));
    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(openPhone).toHaveBeenCalledWith('flights', 'race');
    fireEvent.click(screen.getByRole('button', { name: 'Top up' }));
    expect(openPhone).toHaveBeenLastCalledWith('bank', 'topup');
  });

  it('records it as seen when dismissed', () => {
    const onSeen = vi.fn();
    render(<AnnouncementPrompt open announcement={announcement} onSeen={onSeen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    expect(onSeen).toHaveBeenCalled();
  });
});
