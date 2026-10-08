'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { OpenWorldMode } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { useWorld } from '@/common/game/world-store';
import { applyKey, isGameKey, isTypingTarget, resetControls } from '../input/controls';
import { handleOf } from '../players/presence-directory';
import type { PlayRuntime } from '../runtime/play-runtime';
import { usePlayUi } from '../state/play-ui-store';
import { movementApi } from './movement.api';
import { clearPose } from './spawn-handoff';
import { CAR_ENTER_ID, CAR_EXIT_ID, type Heartbeats } from './use-world-sync';

export interface WorldActionsOptions {
  readonly online: boolean;
  readonly heartbeats: Heartbeats;
}

const DOOR_PREFIX = 'play:door:';
const PLAYER_PREFIX = 'play:player:';
const FADE_MS = 240;

/**
 * What the player does in the open world: get in/out of the car, honk, walk through doors (server-validated), open
 * another player's profile. Listens to the HUD (`interact`, `enter-car`, `exit-car`) and the keyboard.
 */
export function useWorldActions(runtime: PlayRuntime, options: WorldActionsOptions): void {
  const client = useQueryClient();
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const entering = useRef(false);

  useEffect(() => {
    const setMode = useWorld.getState().setMode;

    const enterCar = (): void => {
      if (runtime.mode !== 'walk') return;
      const controller = runtime.controller;
      if (!controller.car) {
        toast({ title: 'No car here', body: 'Your car isn’t parked nearby. Buy one at a car mart or take a danfo.', tone: 'neutral' });
        return;
      }
      if (!runtime.enterCar()) {
        toast({ title: 'Walk up to your car first', tone: 'neutral' });
        return;
      }
      setMode('driving');
      gameEvents.emit('sfx', { id: 'car-door' });
      window.setTimeout(() => {
        if (runtime.mode === 'drive') gameEvents.emit('sfx', { id: 'car-start' });
      }, 380);
      optionsRef.current.heartbeats.send('walk');
    };

    runtime.setEvents({
      onStep: () => gameEvents.emit('sfx', { id: 'footstep', volume: 0.35 }),
      onExitedCar: () => {
        setMode('walking');
        gameEvents.emit('sfx', { id: 'car-door' });
        optionsRef.current.heartbeats.send('car');
      },
    });

    const enterDoor = async (locationId: string): Promise<void> => {
      if (entering.current || runtime.mode === 'ride') return;
      if (!optionsRef.current.online) {
        toast({ title: 'Sandbox', body: `Doors open in the real game (${locationId}).`, tone: 'neutral' });
        return;
      }
      entering.current = true;
      runtime.setFrozen(true);
      const mode: OpenWorldMode = runtime.mode === 'drive' ? 'car' : 'walk';
      try {
        const snapshot = await movementApi.enter({ locationId, position: { x: runtime.controller.x, z: runtime.controller.z }, mode });
        gameEvents.emit('sfx', { id: 'door-open' });
        usePlayUi.getState().setFading(true);
        await new Promise((resolve) => window.setTimeout(resolve, FADE_MS));
        clearPose();
        const world = useWorld.getState();
        world.setDrive(null);
        world.setNearby(null);
        client.setQueryData(queryKeys.snapshot, snapshot);
        world.setMode('inside');
      } catch (error) {
        gameEvents.emit('sfx', { id: 'ui-error' });
        toast({ title: 'Can’t go in', body: errorMessage(error), tone: 'bad' });
        runtime.setFrozen(false);
      } finally {
        entering.current = false;
      }
    };

    const offs = [
      gameEvents.on('interact', ({ interactableId }) => {
        if (interactableId === CAR_ENTER_ID) enterCar();
        else if (interactableId === CAR_EXIT_ID) runtime.requestExitCar();
        else if (interactableId.startsWith(DOOR_PREFIX)) void enterDoor(interactableId.slice(DOOR_PREFIX.length));
        else if (interactableId.startsWith(PLAYER_PREFIX)) {
          const handle = handleOf(interactableId.slice(PLAYER_PREFIX.length));
          if (handle) {
            gameEvents.emit('sfx', { id: 'ui-open' });
            useUi.getState().openPhone('gist', `@${handle}`);
          }
        }
      }),
      gameEvents.on('enter-car', enterCar),
      gameEvents.on('exit-car', () => runtime.requestExitCar()),
    ];

    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Space/Enter on a focused button or link activates it (keyboard users), not the handbrake.
      if ((event.code === 'Space' || event.code === 'Enter') && event.target instanceof HTMLElement && event.target.closest('button, a, [role="button"]')) return;
      const blocked = isTypingTarget(event.target) || useUi.getState().phoneOpen || runtime.mode === 'ride';
      const action = applyKey(event.code, event.type === 'keydown', event.repeat, blocked);
      if (!blocked && isGameKey(event.code)) event.preventDefault();
      if (action === 'car') {
        if (runtime.mode === 'drive') runtime.requestExitCar();
        else enterCar();
      } else if (action === 'horn' && runtime.mode === 'drive') gameEvents.emit('sfx', { id: 'horn' });
    };
    const onBlur = (): void => resetControls();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    const offPhone = useUi.subscribe((state, previous) => {
      if (state.phoneOpen && !previous.phoneOpen) resetControls();
    });

    return () => {
      for (const off of offs) off();
      offPhone();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      resetControls();
    };
  }, [runtime, client]);
}
