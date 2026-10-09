import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PressButton } from '../PressButton';
import { installPointerEvents, rect } from '@/common/testing/pointer-events';

installPointerEvents();

describe('PressButton', () => {
  it('acts on release for any finger, even while another finger is down (no click needed)', () => {
    const onPress = vi.fn();
    render(<PressButton onPress={onPress}>Get out</PressButton>);
    const button = screen.getByRole('button', { name: 'Get out' });
    // Finger 1 holds something else on the screen; finger 2 taps the button. Browsers send no click for it.
    fireEvent.pointerDown(document.body, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(button, { pointerId: 2, pointerType: 'touch' });
    expect(onPress).not.toHaveBeenCalled();
    fireEvent.pointerUp(button, { pointerId: 2, pointerType: 'touch' });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('acts once when the browser also sends its click', () => {
    const onPress = vi.fn();
    render(<PressButton onPress={onPress}>Park</PressButton>);
    const button = screen.getByRole('button', { name: 'Park' });
    fireEvent.pointerDown(button, { pointerId: 7, pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(button, { pointerId: 7, pointerType: 'mouse', button: 0 });
    fireEvent.click(button, { detail: 1 });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires on touch-down when asked (the horn)', () => {
    const onPress = vi.fn();
    render(
      <PressButton pressOn="down" onPress={onPress}>
        Horn
      </PressButton>,
    );
    const button = screen.getByRole('button', { name: 'Horn' });
    fireEvent.pointerDown(button, { pointerId: 3, pointerType: 'touch' });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.dataset.pressed).toBe('true');
    fireEvent.pointerUp(button, { pointerId: 3, pointerType: 'touch' });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.dataset.pressed).toBeUndefined();
  });

  it('does nothing when the finger slides off before lifting, or the touch is cancelled', () => {
    const onPress = vi.fn();
    render(<PressButton onPress={onPress}>Get out</PressButton>);
    const button = screen.getByRole('button', { name: 'Get out' });
    rect(button, { left: 100, top: 100, width: 60, height: 56 });
    fireEvent.pointerDown(button, { pointerId: 4, pointerType: 'touch', clientX: 120, clientY: 120 });
    fireEvent.pointerUp(button, { pointerId: 4, pointerType: 'touch', clientX: 300, clientY: 400 });
    // The captured pointer's click lands on the button anyway: still nothing.
    fireEvent.click(button, { detail: 1 });
    fireEvent.pointerDown(button, { pointerId: 5, pointerType: 'touch', clientX: 120, clientY: 120 });
    fireEvent.pointerCancel(button, { pointerId: 5, pointerType: 'touch' });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('still works from the keyboard and screen readers (click without a pointer)', () => {
    const onPress = vi.fn();
    render(<PressButton onPress={onPress}>Horn</PressButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Horn' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while disabled', () => {
    const onPress = vi.fn();
    render(
      <PressButton onPress={onPress} disabled>
        Refuel
      </PressButton>,
    );
    const button = screen.getByRole('button', { name: 'Refuel' });
    fireEvent.pointerDown(button, { pointerId: 6, pointerType: 'touch' });
    fireEvent.pointerUp(button, { pointerId: 6, pointerType: 'touch' });
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
