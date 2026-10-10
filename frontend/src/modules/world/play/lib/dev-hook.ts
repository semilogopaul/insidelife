import { Vector3, type Camera } from 'three';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { livePose } from '../../navigation/live-pose';
import { activeRoute } from '../../navigation/route-state';
import { controls } from '../input/controls';
import type { PlayRuntime } from '../runtime/play-runtime';

/** Development-only handle for play-testing scripts: `window.__IL_PLAY__` (pose, GPS route, inputs). */
export interface PlayDevHook {
  readonly runtime: PlayRuntime;
  readonly controls: typeof controls;
  readonly livePose: typeof livePose;
  readonly activeRoute: typeof activeRoute;
  setDestination(id: string | null, name?: string): void;
  /** Screen position (CSS px) of a world point with the current camera, or null when behind it. */
  project(x: number, y: number, z: number): { x: number; y: number } | null;
  /** The last game events the world reacted to (`sfx:horn`, `exit-car`, `interact:play:door:…`), newest last. */
  readonly events: string[];
}

type DevWindow = Window & { __IL_PLAY__?: PlayDevHook };

export function exposeDevHook(runtime: PlayRuntime, camera: () => Camera, size: () => { width: number; height: number }): () => void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return () => undefined;
  const events: string[] = [];
  const log = (entry: string): void => {
    events.push(entry);
    if (events.length > 40) events.shift();
  };
  const offs = [
    gameEvents.on('sfx', ({ id }) => log(`sfx:${id}`)),
    gameEvents.on('interact', ({ interactableId }) => log(`interact:${interactableId}`)),
    gameEvents.on('exit-car', () => log('exit-car')),
    gameEvents.on('enter-car', () => log('enter-car')),
  ];
  const hook: PlayDevHook = {
    events,
    runtime,
    controls,
    livePose,
    activeRoute,
    setDestination: (id, name) => useNavigation.getState().setDestination(id, name ?? null),
    project: (x, y, z) => {
      const p = new Vector3(x, y, z).project(camera());
      if (p.z > 1) return null;
      return { x: (p.x * 0.5 + 0.5) * size().width, y: (-p.y * 0.5 + 0.5) * size().height };
    },
  };
  (window as DevWindow).__IL_PLAY__ = hook;
  return () => {
    for (const off of offs) off();
    if ((window as DevWindow).__IL_PLAY__ === hook) delete (window as DevWindow).__IL_PLAY__;
  };
}
