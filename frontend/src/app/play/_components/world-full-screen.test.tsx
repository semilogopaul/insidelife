import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorldFullScreen } from './WorldFullScreen';

describe('WorldFullScreen', () => {
  it('tells the player Lagos is full and that they will be let in automatically, covering the game', () => {
    const { container } = render(<WorldFullScreen />);
    expect(screen.getByText('Lagos is full right now')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/get you in automatically/);
    expect((container.firstChild as HTMLElement).className).toMatch(/fixed inset-0/);
  });
});
