/**
 * Player input shared by the DOM overlay (touch joystick, look pad, pedals) and the keyboard, read by the in-canvas
 * director once per frame. A plain mutable singleton: writers set fields, the frame loop reads and consumes deltas.
 * Nothing here touches React state.
 */

export interface PlayControls {
  /** Keyboard state. */
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  handbrake: boolean;
  /** Touch joystick (walking): x right, y forward, each −1…1. */
  stickX: number;
  stickY: number;
  /** Touch driving controls. */
  touchSteer: number;
  touchGas: number;
  touchBrake: number;
  /** Look deltas in CSS pixels since the last frame (drag/mouse). */
  lookX: number;
  lookY: number;
  /** Zoom delta since the last frame (positive = further out). */
  zoom: number;
  /** `performance.now()` of the last look/zoom input (the camera stops auto-following for a moment). */
  lastLookAt: number;
  /** Pending taps in normalised device coordinates. */
  readonly taps: { x: number; y: number }[];
  /** Where a mouse rests over the canvas (normalised device coordinates), for hover highlights; null when away. */
  hover: { x: number; y: number } | null;
}

export const controls: PlayControls = {
  forward: false,
  back: false,
  left: false,
  right: false,
  run: false,
  handbrake: false,
  stickX: 0,
  stickY: 0,
  touchSteer: 0,
  touchGas: 0,
  touchBrake: 0,
  lookX: 0,
  lookY: 0,
  zoom: 0,
  lastLookAt: 0,
  taps: [],
  hover: null,
};

/** Release everything (window blur, phone opened, layer unmounted). */
export function resetControls(): void {
  controls.forward = controls.back = controls.left = controls.right = controls.run = controls.handbrake = false;
  controls.stickX = controls.stickY = 0;
  controls.touchSteer = controls.touchGas = controls.touchBrake = 0;
  controls.lookX = controls.lookY = controls.zoom = 0;
  controls.taps.length = 0;
  controls.hover = null;
}

export function pushTap(x: number, y: number): void {
  if (controls.taps.length < 4) controls.taps.push({ x, y });
}

/** Walking intent in screen terms: x right, y forward (−1…1), keyboard and stick combined. */
export function moveAxes(out: { x: number; y: number }): { x: number; y: number } {
  let x = controls.stickX + (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  let y = controls.stickY + (controls.forward ? 1 : 0) - (controls.back ? 1 : 0);
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  out.x = x;
  out.y = y;
  return out;
}

/** Driving intent from keys and touch pedals. */
export function driveAxes(out: { throttle: number; brake: number; steer: number; handbrake: boolean }, invertSteering: boolean): void {
  out.throttle = Math.min(1, (controls.forward ? 1 : 0) + controls.touchGas);
  out.brake = Math.min(1, (controls.back ? 1 : 0) + controls.touchBrake);
  const steer = Math.max(-1, Math.min(1, (controls.right ? 1 : 0) - (controls.left ? 1 : 0) + controls.touchSteer));
  out.steer = invertSteering ? -steer : steer;
  out.handbrake = controls.handbrake;
}

export type KeyAction = 'interact' | 'car' | 'horn' | 'map';

const MOVE_KEYS: Readonly<Record<string, keyof Pick<PlayControls, 'forward' | 'back' | 'left' | 'right' | 'run' | 'handbrake'>>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  Space: 'handbrake',
};

const ACTION_KEYS: Readonly<Record<string, KeyAction>> = { KeyE: 'interact', KeyF: 'car', KeyH: 'horn', KeyM: 'map' };

/** True when the key event belongs to a text field or an open dialog (the phone, sheets). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.closest('[role="dialog"]') !== null;
}

/**
 * Apply a keyboard event to the movement state. Returns the one-shot action it triggers (on key down), if any.
 * Movement keys are ignored while `blocked` (phone open, typing).
 */
export function applyKey(code: string, down: boolean, repeat: boolean, blocked: boolean): KeyAction | null {
  const move = MOVE_KEYS[code];
  if (move) {
    controls[move] = down && !blocked;
    return null;
  }
  if (!down || repeat || blocked) return null;
  return ACTION_KEYS[code] ?? null;
}

/** Is this key one the game uses (so the page shouldn't scroll on it)? */
export const isGameKey = (code: string): boolean => code in MOVE_KEYS || code in ACTION_KEYS;
