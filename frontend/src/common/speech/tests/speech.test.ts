import { beforeEach, describe, expect, it } from 'vitest';
import { SPEECH_MAX_LENGTH, type ChatSaidDto } from '@insidelife/shared';
import { keyboardInset } from '@/common/hooks/use-keyboard-inset';
import { BUBBLE_MAX_MS, BUBBLE_MIN_MS, NEARBY_KEEP_MS, NEARBY_MAX_LINES, audible, bubbleDurationMs, draftToLine, earshotOf, useSpeech } from '..';

const said = (overrides: Partial<ChatSaidDto> = {}): ChatSaidDto => ({
  id: 'l1',
  characterId: 'kemi',
  handle: 'kemi_o',
  firstName: 'Kemi',
  text: 'How far?',
  at: 1,
  scope: 'street',
  locationId: 'street:yaba',
  ...overrides,
});

describe('bubbleDurationMs', () => {
  it('keeps short lines up 6 s and long ones longer, never past 10 s', () => {
    expect(bubbleDurationMs('Hi')).toBe(BUBBLE_MIN_MS);
    expect(bubbleDurationMs('a'.repeat(60))).toBeGreaterThan(BUBBLE_MIN_MS);
    expect(bubbleDurationMs('a'.repeat(SPEECH_MAX_LENGTH))).toBeLessThanOrEqual(BUBBLE_MAX_MS);
    expect(bubbleDurationMs('a'.repeat(1000))).toBe(BUBBLE_MAX_MS);
  });
});

describe('audible', () => {
  const street = earshotOf('street:yaba', false);
  const lounge = earshotOf('vi-lounge', false);
  const riding = earshotOf('unilag', true);

  it('street lines show only while you are outside (riding counts)', () => {
    expect(audible(said(), street, 'ada')).toBe(true);
    expect(audible(said(), riding, 'ada')).toBe(true);
    expect(audible(said(), lounge, 'ada')).toBe(false);
  });

  it('place lines show only in that place', () => {
    const inLounge = said({ scope: 'place', locationId: 'vi-lounge' });
    expect(audible(inLounge, lounge, 'ada')).toBe(true);
    expect(audible(said({ scope: 'place', locationId: 'quilox' }), lounge, 'ada')).toBe(false);
    expect(audible(inLounge, street, 'ada')).toBe(false);
  });

  it('your own lines always show; nothing before the snapshot loads', () => {
    expect(audible(said({ characterId: 'ada', scope: 'place', locationId: 'elsewhere' }), street, 'ada')).toBe(true);
    expect(audible(said(), earshotOf(null, false), 'ada')).toBe(false);
  });
});

describe('draftToLine', () => {
  it('collapses whitespace, trims and caps like the server', () => {
    expect(draftToLine('  how   far \n o ')).toBe('how far o');
    expect(draftToLine('x'.repeat(500))).toHaveLength(SPEECH_MAX_LENGTH);
  });
});

describe('keyboardInset', () => {
  it('measures the keyboard over the bottom of the page, ignoring browser bars', () => {
    expect(keyboardInset(null, 844)).toBe(0);
    expect(keyboardInset({ height: 844, offsetTop: 0 }, 844)).toBe(0);
    expect(keyboardInset({ height: 800, offsetTop: 0 }, 844)).toBe(0);
    expect(keyboardInset({ height: 500, offsetTop: 0 }, 844)).toBe(344);
    // iOS pans the page up when the input focuses.
    expect(keyboardInset({ height: 500, offsetTop: 40 }, 844)).toBe(304);
  });
});

describe('speech store', () => {
  beforeEach(() => {
    useSpeech.setState({ selfId: 'ada', lines: [], bubbles: [], composerOpen: false, unread: 0 });
  });

  it('keeps one bubble per speaker (a new line replaces the old) and logs every line once', () => {
    const { hear } = useSpeech.getState();
    hear(said({ id: 'a' }), 1_000);
    hear(said({ id: 'a' }), 1_100);
    hear(said({ id: 'b', text: 'You dey?' }), 2_000);
    hear(said({ id: 'c', characterId: 'ada', handle: 'ada_b', text: 'I dey' }), 2_500);
    const { lines, bubbles } = useSpeech.getState();
    expect(lines.map((line) => line.id)).toEqual(['a', 'b', 'c']);
    expect(lines[2]?.mine).toBe(true);
    expect(bubbles.map((bubble) => [bubble.characterId, bubble.text])).toEqual([
      ['kemi', 'You dey?'],
      ['ada', 'I dey'],
    ]);
  });

  it('expires bubbles after their time and log lines after ten minutes', () => {
    useSpeech.getState().hear(said(), 0);
    useSpeech.getState().expire(BUBBLE_MIN_MS - 1);
    expect(useSpeech.getState().bubbles).toHaveLength(1);
    useSpeech.getState().expire(BUBBLE_MIN_MS + 1);
    expect(useSpeech.getState().bubbles).toHaveLength(0);
    expect(useSpeech.getState().lines).toHaveLength(1);
    useSpeech.getState().expire(NEARBY_KEEP_MS + 1);
    expect(useSpeech.getState().lines).toHaveLength(0);
  });

  it(`keeps the last ${NEARBY_MAX_LINES} lines`, () => {
    for (let i = 0; i < NEARBY_MAX_LINES + 5; i++) useSpeech.getState().hear(said({ id: `l${i}` }), i);
    expect(useSpeech.getState().lines).toHaveLength(NEARBY_MAX_LINES);
    expect(useSpeech.getState().lines[0]?.id).toBe('l5');
  });

  it('counts unread lines from others until the Talk box opens', () => {
    const { hear, openComposer } = useSpeech.getState();
    hear(said({ id: 'a' }), 0);
    hear(said({ id: 'b', characterId: 'ada' }), 1);
    expect(useSpeech.getState().unread).toBe(1);
    openComposer();
    expect(useSpeech.getState().unread).toBe(0);
    hear(said({ id: 'c' }), 2);
    expect(useSpeech.getState().unread).toBe(0);
  });
});
