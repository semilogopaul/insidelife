import { describe, expect, it } from 'vitest';
import {
  GLOBAL_CHANNEL,
  channelKind,
  completeMention,
  dmChannel,
  dmPartnerId,
  mentionAtCaret,
  mentionsHandle,
  parseMentions,
  venueChannel,
} from '../services/chat-channels';

const A = '151dc413-bbe9-421f-a5aa-6ec48047b0cb';
const B = 'c8dfe817-9ec6-42ff-9843-e4ecb2ff6586';

describe('channel ids', () => {
  it('builds the same DM channel from either side (ids sorted)', () => {
    expect(dmChannel(B, A)).toBe(`dm:${A}:${B}`);
    expect(dmChannel(A, B)).toBe(dmChannel(B, A));
  });

  it('names venue channels and classifies channels', () => {
    expect(venueChannel('eko-hotel')).toBe('venue:eko-hotel');
    expect(channelKind(GLOBAL_CHANNEL)).toBe('global');
    expect(channelKind('venue:eko-hotel')).toBe('venue');
    expect(channelKind(dmChannel(A, B))).toBe('dm');
    expect(channelKind('venue:')).toBeNull();
    expect(channelKind('district:yaba')).toBeNull();
  });

  it('finds the other DM participant', () => {
    const channel = dmChannel(A, B);
    expect(dmPartnerId(channel, A)).toBe(B);
    expect(dmPartnerId(channel, B)).toBe(A);
    expect(dmPartnerId(channel, 'someone-else')).toBeNull();
    expect(dmPartnerId(GLOBAL_CHANNEL, A)).toBeNull();
  });
});

describe('mentions', () => {
  it('splits text and @handles', () => {
    expect(parseMentions('how far @Tolu_B, see @emeka!')).toEqual([
      { kind: 'text', text: 'how far ' },
      { kind: 'mention', handle: 'tolu_b' },
      { kind: 'text', text: ', see ' },
      { kind: 'mention', handle: 'emeka' },
      { kind: 'text', text: '!' },
    ]);
  });

  it('ignores emails, too-short handles and plain text', () => {
    expect(parseMentions('mail ada@example.com or @ab')).toEqual([{ kind: 'text', text: 'mail ada@example.com or @ab' }]);
    expect(parseMentions('')).toEqual([]);
    expect(mentionsHandle('oya @ADA123 come', 'ada123')).toBe(true);
    expect(mentionsHandle('ada123 come', 'ada123')).toBe(false);
  });

  it('autocompletes the mention at the caret', () => {
    const text = 'hi @tol';
    expect(mentionAtCaret(text, text.length)).toEqual({ query: 'tol', start: 3 });
    expect(mentionAtCaret('hi tol', 6)).toBeNull();
    expect(completeMention(text, 3, text.length, 'tolu_b')).toEqual({ text: 'hi @tolu_b ', caret: 11 });
  });
});
