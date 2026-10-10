import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/common/game/ui-store';
import { PointerLayer } from '../overlay/PointerLayer';

describe('the walking stick’s resting ring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUi.getState().updateSettings({ walkStick: 'right', hudHidden: false });
    Element.prototype.setPointerCapture = () => undefined;
  });
  afterEach(() => vi.useRealTimers());

  it('stays on a touch screen while you can walk: “Drag to walk” at first, then a faint ring', () => {
    render(<PointerLayer walking touchUi />);
    const ring = screen.getByTestId('stick-hint');
    expect(ring.textContent).toContain('Drag');
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByTestId('stick-hint').getAttribute('data-fresh')).toBeNull();
    expect(screen.getByTestId('stick-hint').textContent).toBe('');
  });

  it('follows the stick-side setting and stays on a clean screen', () => {
    useUi.getState().updateSettings({ walkStick: 'left', hudHidden: true });
    render(<PointerLayer walking touchUi />);
    const ring = screen.getByTestId('stick-hint');
    expect(ring.getAttribute('data-side')).toBe('left');
    expect(ring.className).toContain('left-[');
  });

  it('fades while your thumb holds the stick and comes back on release', () => {
    render(<PointerLayer walking touchUi />);
    const surface = screen.getByTestId('play-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'touch', clientX: 330, clientY: 700, button: 0 });
    expect(screen.getByTestId('stick-hint').style.opacity).toBe('0');
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'touch', clientX: 330, clientY: 700, button: 0 });
    expect(screen.getByTestId('stick-hint').style.opacity).toBe('');
  });

  it('isn’t drawn with a mouse, or when you can’t walk (driving, overview camera)', () => {
    const { rerender } = render(<PointerLayer walking touchUi={false} />);
    expect(screen.queryByTestId('stick-hint')).toBeNull();
    rerender(<PointerLayer walking={false} touchUi />);
    expect(screen.queryByTestId('stick-hint')).toBeNull();
  });
});
