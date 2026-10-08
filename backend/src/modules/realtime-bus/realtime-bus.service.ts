import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@insidelife/shared';

type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;
type EventName = keyof ServerToClientEvents;

/** Room every socket of a character joins. */
export const characterRoom = (characterId: string): string => `character:${characterId}`;

/**
 * Outbound realtime port. Domain code publishes here after a transaction commits; the gateway attaches the Socket.IO
 * server on startup (with the Redis adapter, emits reach sockets on every instance). Emitting before the gateway is
 * ready is a no-op — clients reconcile on their next snapshot fetch.
 */
@Injectable()
export class RealtimeBus {
  private readonly logger = new Logger(RealtimeBus.name);
  private server: RealtimeServer | null = null;

  attach(server: RealtimeServer): void {
    this.server = server;
  }

  toCharacter<E extends EventName>(characterId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    this.emit(characterRoom(characterId), event, ...args);
  }

  toRoom<E extends EventName>(room: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    this.emit(room, event, ...args);
  }

  broadcast<E extends EventName>(event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    if (!this.server) return;
    this.server.emit(event, ...args);
  }

  private emit<E extends EventName>(room: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    if (!this.server) {
      this.logger.debug(`Realtime not ready; dropped ${String(event)}`);
      return;
    }
    this.server.to(room).emit(event, ...args);
  }
}
