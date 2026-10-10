import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents, type GameEventMap } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { installPointerEvents } from '@/common/testing/pointer-events';
import { controls, resetControls } from '../input/controls';
import { DriveControls } from '../overlay/DriveControls';
import { usePlayUi } from '../state/play-ui-store';

installPointerEvents();

/** Pixel size a Tailwind sizing class gives (`size-14`, `h-[60px]`, `w-[78px]`…), or null. */
function classPx(className: string, axis: 'w' | 'h'): number | null {
  for (const token of className.split(/\s+/)) {
    if (token.includes(':')) continue;
    const match = /^(size|w|h)-(?:\[(\d+)px\]|(\d+(?:\.\d+)?))$/.exec(token);
    if (!match) continue;
    const [, kind, px, units] = match;
    if (kind !== 'size' && kind !== axis) continue;
    return px ? Number(px) : Number(units) * 4;
  }
  return null;
}

const touch = (pointerId: number) => ({ pointerId, pointerType: 'touch' });

describe('DriveControls', () => {
  const sfx = vi.fn<(payload: GameEventMap['sfx']) => void>();
  const exitCar = vi.fn();
  let offs: (() => void)[] = [];

  beforeEach(() => {
    resetControls();
    sfx.mockReset();
    exitCar.mockReset();
    offs = [gameEvents.on('sfx', sfx), gameEvents.on('exit-car', exitCar)];
    useUi.setState((state) => ({ settings: { ...state.settings, walkStick: 'right' } }));
  });
  afterEach(() => {
    for (const off of offs) off();
  });

  it('gives every control a thumb-sized hit area (at least 44 px each way)', () => {
    render(<DriveControls />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim())).toEqual(['Horn', 'Get out', 'Steer left', 'Steer right', 'Brake / reverse', 'Accelerate']);
    for (const button of buttons) {
      const height = classPx(button.className, 'h');
      expect(height, button.textContent ?? '').not.toBeNull();
      expect(height as number).toBeGreaterThanOrEqual(44);
      const width = classPx(button.className, 'w');
      // "Get out" is as wide as its label (padding + icon + text) — well over 44 px.
      if (width !== null) expect(width).toBeGreaterThanOrEqual(44);
    }
  });

  it('honks while the other thumb holds the gas (a second finger gets no click)', () => {
    render(<DriveControls />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Accelerate' }), touch(1));
    expect(controls.touchGas).toBe(1);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Horn' }), touch(2));
    expect(sfx).toHaveBeenCalledWith({ id: 'horn' });
    expect(controls.touchGas).toBe(1);
  });

  it('gets out while the other thumb is on the brake, once', () => {
    render(<DriveControls />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Brake / reverse' }), touch(1));
    const getOut = screen.getByRole('button', { name: /Get out/ });
    fireEvent.pointerDown(getOut, touch(2));
    fireEvent.pointerUp(getOut, touch(2));
    fireEvent.click(getOut, { detail: 1 });
    expect(exitCar).toHaveBeenCalledTimes(1);
  });

  it('steers and accelerates at the same time, each finger released on its own', () => {
    render(<DriveControls />);
    const gas = screen.getByRole('button', { name: 'Accelerate' });
    const right = screen.getByRole('button', { name: 'Steer right' });
    fireEvent.pointerDown(gas, touch(1));
    fireEvent.pointerDown(right, touch(2));
    expect([controls.touchGas, controls.touchSteer]).toEqual([1, 1]);
    fireEvent.pointerUp(gas, touch(1));
    expect([controls.touchGas, controls.touchSteer]).toEqual([0, 1]);
    // A stray release of another finger on the arrow doesn't let go of it.
    fireEvent.lostPointerCapture(right, touch(9));
    expect(controls.touchSteer).toBe(1);
    fireEvent.pointerCancel(right, touch(2));
    expect(controls.touchSteer).toBe(0);
  });

  it('lets go of everything when it unmounts (phone opened, got out)', () => {
    const { unmount } = render(<DriveControls />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Accelerate' }), touch(1));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Steer left' }), touch(2));
    unmount();
    expect([controls.touchGas, controls.touchSteer, controls.touchBrake]).toEqual([0, 0, 0]);
  });

  it('offers "Park & enter" from the controls themselves (works with the HUD hidden), while braking', () => {
    const interact = vi.fn();
    offs.push(gameEvents.on('interact', interact));
    usePlayUi.getState().setDriveOffer({ id: 'play:door:ajah-market', kind: 'door', label: 'Park & enter Ajah Market', locationId: 'ajah-market' });
    render(<DriveControls />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Brake / reverse' }), touch(1));
    const park = screen.getByRole('button', { name: /Park & enter Ajah Market/ });
    fireEvent.pointerDown(park, touch(2));
    fireEvent.pointerUp(park, touch(2));
    expect(interact).toHaveBeenCalledWith({ interactableId: 'play:door:ajah-market' });
    expect(screen.getByRole('button', { name: /Get out/ })).toBeTruthy();
    usePlayUi.getState().setDriveOffer(null);
  });

  it('lets go of the pedals when the phone opens over them', () => {
    render(<DriveControls />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Accelerate' }), touch(1));
    act(() => useUi.setState({ phoneOpen: true }));
    expect(controls.touchGas).toBe(0);
    act(() => useUi.setState({ phoneOpen: false }));
    // Another control pressed later doesn't bring the stale gas back.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Steer left' }), touch(2));
    expect([controls.touchGas, controls.touchSteer]).toEqual([0, -1]);
  });

  it.each([
    ['right', /right-/, /left-/],
    ['left', /left-/, /right-/],
  ] as const)('puts the steering on the walk-stick side (%s) and the pedals on the other', (side, steeringSide, pedalSide) => {
    useUi.setState((state) => ({ settings: { ...state.settings, walkStick: side } }));
    render(<DriveControls />);
    expect(screen.getByTestId('steering').className).toMatch(steeringSide);
    expect(screen.getByTestId('pedals').className).toMatch(pedalSide);
    expect(screen.getByTestId('drive-controls').dataset.stick).toBe(side);
  });
});
