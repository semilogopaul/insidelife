import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VenueMomentDto } from '@insidelife/shared';
import { VenueMomentBanner } from '@/common/night-out';

const shoutout = (tier: VenueMomentDto['tier']): VenueMomentDto => ({
  id: 'm1',
  venueId: 'quilox',
  kind: 'shoutout',
  from: { characterId: 'ada-id', handle: 'ada', firstName: 'Ada' },
  to: null,
  label: 'Shoutout',
  emoji: '🎤',
  tier,
  effect: 'spotlight',
  message: 'Lagos to the world',
  durationMs: 8_000,
  startsAt: 0,
});

describe('VenueMomentBanner', () => {
  it('puts the name in bold for everyone, with the message, and announces it', () => {
    render(<VenueMomentBanner moment={shoutout('shoutout-basic')} variant="headline" reducedMotion={false} />);
    const banner = screen.getByRole('status');
    expect(banner.getAttribute('aria-label')).toBe('🎤 Shout out: @ada — Lagos to the world');
    expect(screen.getByText('@ada').closest('p')?.className).toContain('type-slogan');
    expect(screen.getByText('“Lagos to the world”')).toBeTruthy();
  });

  it('goes gold for an odogwu, and confetti stays off with reduced motion', () => {
    const { container, rerender } = render(<VenueMomentBanner moment={shoutout('shoutout-odogwu')} variant="headline" reducedMotion={false} />);
    expect(screen.getByRole('status').className).toContain('bg-gradient-to-br');
    const confetti = container.querySelectorAll('span.absolute.top-0').length;
    expect(confetti).toBeGreaterThan(0);
    rerender(<VenueMomentBanner moment={shoutout('shoutout-odogwu')} variant="headline" reducedMotion />);
    expect(container.querySelectorAll('span.absolute.top-0').length).toBe(0);
  });

  it('shows a bottle as a line under the shoutout; the name opens their profile', () => {
    const onOpenProfile = vi.fn();
    render(
      <VenueMomentBanner
        moment={{ ...shoutout('champagne'), kind: 'bottle', label: 'Champagne', emoji: '🍾', to: { characterId: 'femi-id', handle: 'femi', firstName: 'Femi' }, message: null }}
        variant="chip"
        reducedMotion
        onOpenProfile={onOpenProfile}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('@ada → @femi: Champagne');
    fireEvent.click(screen.getByRole('button', { name: '@ada → @femi' }));
    expect(onOpenProfile).toHaveBeenCalledWith('ada');
  });
});
