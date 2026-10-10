import type { ChatSaidDto } from '@insidelife/shared';
import { characterRoom } from '../realtime-bus/realtime-bus.service.js';
import type { SpokenLine } from './speech.service.js';

/** The slice of the Socket.IO server speech needs (rooms are unions: a socket in several of them hears a line once). */
export interface SpeechEmitter {
  to(rooms: string | string[]): SpeechBroadcast;
}

export interface SpeechBroadcast {
  except(rooms: string | string[]): SpeechBroadcast;
  emit(event: 'chat:said', line: ChatSaidDto): boolean;
}

/**
 * Send a spoken line to its audience. Street: the speaker's cell room (everyone whose 3×3 neighbourhood includes it,
 * i.e. everyone who can see the speaker) plus the speaker's own sockets, minus every socket of anyone in a block with
 * them. Place: each listener's character room.
 */
export function deliverSpeech(server: SpeechEmitter, { line, audience }: SpokenLine): void {
  const self = characterRoom(line.characterId);
  if (audience.kind === 'place') {
    server.to(audience.characterIds.map(characterRoom)).emit('chat:said', line);
    return;
  }
  const rooms = audience.cellRoom ? [audience.cellRoom, self] : [self];
  const blocked = audience.blockedIds.map(characterRoom);
  (blocked.length > 0 ? server.to(rooms).except(blocked) : server.to(rooms)).emit('chat:said', line);
}
