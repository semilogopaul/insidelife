'use client';

import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { REALTIME_NAMESPACE, type ClientToServerEvents, type ServerToClientEvents } from '@insidelife/shared';
import { env } from '@/config/env';
import { refreshSession } from '@/common/api/http';
import { useSession } from '@/common/auth/session-store';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface ConnectionState {
  readonly status: 'idle' | 'connecting' | 'online' | 'offline';
  /** Your Lagos instance (who you see on the streets and in Lagos chat), once the server has placed you. */
  readonly instance: { readonly id: string; readonly players: number } | null;
  set(status: ConnectionState['status']): void;
}

export const useConnection = create<ConnectionState>()((set) => ({ status: 'idle', instance: null, set: (status) => set({ status }) }));

let socket: GameSocket | null = null;

/** Lazily create the single realtime connection (needs a living character on the server). */
export function getSocket(): GameSocket {
  if (socket) return socket;
  socket = io(`${env.realtimeUrl}${REALTIME_NAMESPACE}`, {
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    auth: (callback) => callback({ token: useSession.getState().accessToken ?? '' }),
  });
  const connection = useConnection.getState();
  socket.on('connect', () => connection.set('online'));
  socket.on('world:instance', (instance) => useConnection.setState({ instance }));
  socket.on('disconnect', () => connection.set('offline'));
  socket.on('connect_error', () => {
    connection.set('offline');
    // The handshake may have failed on an expired token: refresh, then let the built-in backoff retry.
    void refreshSession();
  });
  return socket;
}

export function connectSocket(): void {
  const instance = getSocket();
  if (instance.connected) return;
  useConnection.getState().set('connecting');
  instance.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  useConnection.getState().set('idle');
}
