'use client';

import { useEffect, useRef } from 'react';
import type { ServerToClientEvents } from '@insidelife/shared';
import { getSocket } from './socket';

/** Subscribe to a server event for the component's lifetime. The latest handler is always used. */
export function useRealtimeEvent<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const socket = getSocket();
    const listener = ((...args: Parameters<ServerToClientEvents[E]>) =>
      (ref.current as (...a: Parameters<ServerToClientEvents[E]>) => void)(...args)) as ServerToClientEvents[E];
    // socket.io's typed overloads don't narrow generic event names; the listener shape matches the contract.
    (socket.on as (event: E, listener: ServerToClientEvents[E]) => void)(event, listener);
    return () => {
      (socket.off as (event: E, listener: ServerToClientEvents[E]) => void)(event, listener);
    };
  }, [event]);
}
