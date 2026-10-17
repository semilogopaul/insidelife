import type { SocialMomentDto, SpawnPoint } from '@insidelife/shared';

/**
 * Typed fire-and-forget event bus between features (features can't import each other).
 * - UI/world → audio: `sfx`, `music`
 * - anyone → world: `interact`, `exit-building`, `enter-car`, `exit-car`
 * - anyone → overlays: `celebrate`
 */
export type SfxId =
  | 'ui-click'
  | 'ui-open'
  | 'ui-close'
  | 'ui-error'
  | 'ui-success'
  | 'cash-in'
  | 'cash-out'
  | 'notification'
  | 'door-open'
  | 'door-close'
  | 'car-start'
  | 'car-door'
  | 'horn'
  | 'footstep'
  | 'eat'
  | 'level-up'
  | 'celebration'
  | 'danfo-conductor'
  | 'spray';

export interface GameEventMap {
  sfx: { readonly id: SfxId; readonly volume?: number };
  /** Ambience/music context switches (e.g. entering a club). */
  'music-context': { readonly context: 'city' | 'home' | 'club' | 'campus' | 'office' | 'hospital' | 'party' | 'menu'; readonly venueId?: string };
  interact: { readonly interactableId: string };
  /**
   * Step outside. Emitters that already called `POST /characters/me/exits` pass the returned `spawn` so the world
   * places the player (and their car) without asking again; without it the world performs the exit itself.
   */
  'exit-building': { readonly spawn?: SpawnPoint };
  'enter-car': Record<string, never>;
  'exit-car': Record<string, never>;
  celebrate: { readonly title: string; readonly body?: string; readonly kind: 'milestone' | 'achievement' | 'goal' };
  /** A delivery-style action finished (a Chowdeck order): at home the food/bag can appear and the eat moment can play. */
  'delivery-arrived': { readonly actionId: string; readonly items: string; readonly atHome: boolean };
  /** Speak a GPS/voice line (audio feature decides whether voice guidance is on). */
  speak: { readonly text: string };
  /** A hug or kiss to show in 3D (you did it; someone doing it to you arrives over realtime). */
  'social-moment': SocialMomentDto;
  /**
   * A place feature with its own panel was chosen (a `PlaceService` with `opens: { panel }`, e.g. a club's DJ booth):
   * the feature that owns the panel shows it.
   */
  'open-panel': { readonly panel: string; readonly serviceId: string; readonly locationId: string | null };
}

type Handler<K extends keyof GameEventMap> = (payload: GameEventMap[K]) => void;

class GameEvents {
  private readonly handlers = new Map<keyof GameEventMap, Set<(payload: never) => void>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<K>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as (payload: never) => void);
    this.handlers.set(event, set);
    return () => set.delete(handler as (payload: never) => void);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    for (const handler of this.handlers.get(event) ?? []) (handler as Handler<K>)(payload);
  }
}

export const gameEvents = new GameEvents();
