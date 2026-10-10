'use client';

import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { REALTIME_NAMESPACE, type ClientToServerEvents, type ServerToClientEvents } from '@insidelife/shared';
import { env } from '@/config/env';
import { freshAccessToken, refreshSession } from '@/common/api/http';
import { createFullRetry } from './full-retry';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface ConnectionState {
  readonly status: 'idle' | 'connecting' | 'online' | 'offline';
  /** Your Lagos instance (who you see on the streets and in Lagos chat), once the server has placed you. */
  readonly instance: { readonly id: string; readonly players: number } | null;
  /** The server is at its players-online cap: show the waiting screen until it lets us in. */
  readonly full: boolean;
  set(status: ConnectionState['status']): void;
}

export const useConnection = create<ConnectionState>()((set) => ({ status: 'idle', instance: null, full: false, set: (status) => set({ status }) }));

let socket: GameSocket | null = null;
/** The game wants a connection (between connectSocket and disconnectSocket). */
let wanted = false;
/** Times in a row the server closed the socket before placing us (bad token, server mid-restart). */
let serverCloses = 0;
const MAX_SERVER_CLOSE_RETRIES = 3;
/** "Lagos is full": retry on our own, 20-40 s apart, until placed. */
const fullRetry = createFullRetry({
  connect: () => {
    if (wanted) socket?.connect();
  },
  setFull: (full) => useConnection.setState({ full }),
});

/** Lazily create the single realtime connection (needs a living character on the server). */
export function getSocket(): GameSocket {
  if (socket) return socket;
  socket = io(`${env.realtimeUrl}${REALTIME_NAMESPACE}`, {
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    // Every (re)connection handshakes with a token that is still valid, refreshing it first if it's about to lapse.
    auth: (callback) => void freshAccessToken().then((token) => callback({ token: token ?? '' })),
  });
  const connection = useConnection.getState();
  socket.on('connect', () => connection.set('online'));
  socket.on('world:full', () => fullRetry.onFull());
  socket.on('world:instance', (instance) => {
    serverCloses = 0;
    fullRetry.onPlaced();
    useConnection.setState({ instance });
  });
  socket.on('disconnect', (reason) => {
    connection.set('offline');
    // Socket.IO only reconnects by itself after network trouble. When the server closed us (it refused the handshake
    // token), refresh the session and try again a few times; a refresh that can't reach the API signs nobody out.
    if (useConnection.getState().full) return; // turned away at the cap: the full-retry timer reconnects
    if (reason !== 'io server disconnect' || !wanted || serverCloses >= MAX_SERVER_CLOSE_RETRIES) return;
    serverCloses += 1;
    window.setTimeout(() => {
      void refreshSession().then((refreshed) => {
        if (refreshed && wanted) socket?.connect();
      });
    }, 1_000 * serverCloses);
  });
  socket.on('connect_error', () => {
    connection.set('offline');
    // The handshake may have failed on an expired token: refresh, then let the built-in backoff retry.
    void refreshSession();
  });
  return socket;
}

export function connectSocket(): void {
  wanted = true;
  serverCloses = 0;
  const instance = getSocket();
  if (instance.connected) return;
  useConnection.getState().set('connecting');
  instance.connect();
}

export function disconnectSocket(): void {
  wanted = false;
  fullRetry.cancel();
  socket?.disconnect();
  useConnection.getState().set('idle');
}
