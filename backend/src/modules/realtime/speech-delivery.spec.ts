import { describe, expect, it } from 'vitest';
import type { ChatSaidDto } from '@insidelife/shared';
import { deliverSpeech, type SpeechBroadcast, type SpeechEmitter } from './speech-delivery.js';

interface Sent {
  readonly to: readonly string[];
  readonly except: readonly string[];
  readonly event: string;
  readonly payload: unknown;
}

function recorder(): { server: SpeechEmitter; sent: Sent[] } {
  const sent: Sent[] = [];
  const broadcast = (to: string[], except: string[]): SpeechBroadcast => ({
    except: (rooms) => broadcast(to, [...except, ...(Array.isArray(rooms) ? rooms : [rooms])]),
    emit: (event: 'chat:said', payload: ChatSaidDto) => {
      sent.push({ to, except, event, payload });
      return true;
    },
  });
  return { server: { to: (rooms) => broadcast(Array.isArray(rooms) ? rooms : [rooms], []) }, sent };
}

const line: ChatSaidDto = { id: 'l1', characterId: 'ada', handle: 'ada_b', firstName: 'Ada', text: 'How far?', at: 1, scope: 'street', locationId: 'street:yaba' };

describe('deliverSpeech', () => {
  it('street: the speaker’s cell room and their own sockets, once, minus blocked players', () => {
    const { server, sent } = recorder();
    deliverSpeech(server, { line, audience: { kind: 'street', cellRoom: 'lagos-1|cell:3:4', blockedIds: ['tobi', 'kemi'] } });
    expect(sent).toEqual([{ to: ['lagos-1|cell:3:4', 'character:ada'], except: ['character:tobi', 'character:kemi'], event: 'chat:said', payload: line }]);
  });

  it('street before the first position report: only the speaker hears it', () => {
    const { server, sent } = recorder();
    deliverSpeech(server, { line, audience: { kind: 'street', cellRoom: null, blockedIds: [] } });
    expect(sent).toEqual([{ to: ['character:ada'], except: [], event: 'chat:said', payload: line }]);
  });

  it('place: every listener’s character room', () => {
    const { server, sent } = recorder();
    const inside = { ...line, scope: 'place' as const, locationId: 'vi-lounge' };
    deliverSpeech(server, { line: inside, audience: { kind: 'place', characterIds: ['ada', 'kemi'] } });
    expect(sent).toEqual([{ to: ['character:ada', 'character:kemi'], except: [], event: 'chat:said', payload: inside }]);
  });
});
