import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPEECH_MAX_LENGTH, type ChatSaidDto } from '@insidelife/shared';
import { useUi } from '@/common/game/ui-store';
import { SpeechError, useSpeech } from '@/common/speech';
import { NearbyAnnouncer, NearbyFeed, agoLabel } from '../components/NearbyLog';
import { TalkButton } from '../components/TalkButton';
import { TalkComposer, withDictation } from '../components/TalkComposer';
import { TalkFeed, TalkLayer } from '../components/TalkLayer';

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

type FakeWindow = Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };

/** An on-device recogniser that hears `words` as soon as it starts. */
function installRecogniser(words: string) {
  const started = vi.fn();
  class FakeRecognition {
    lang = '';
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    processLocally = false;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    static available = vi.fn(async () => 'available');
    static install = vi.fn(async () => true);
    start() {
      started(this.lang, this.processLocally);
      this.onresult?.({ results: [Object.assign([{ transcript: words }], { isFinal: true })] });
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
  }
  (window as FakeWindow).SpeechRecognition = FakeRecognition;
  return started;
}

beforeEach(() => {
  useSpeech.setState({ selfId: 'ada', lines: [], bubbles: [], composerOpen: true, unread: 0 });
  useUi.setState({ phoneOpen: false });
  useUi.getState().updateSettings({ hudHidden: false });
});

afterEach(() => {
  delete (window as FakeWindow).SpeechRecognition;
  delete (window as FakeWindow).webkitSpeechRecognition;
});

describe('TalkComposer', () => {
  it('sends what you typed with Enter, then closes', async () => {
    const send = vi.fn(async () => undefined);
    render(<TalkComposer send={send} />);
    const input = screen.getByLabelText('Say something to people nearby');
    fireEvent.change(input, { target: { value: '  How   far my people? ' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(send).toHaveBeenCalledWith('How far my people?'));
    await waitFor(() => expect(useSpeech.getState().composerOpen).toBe(false));
  });

  it('won’t send an empty line', () => {
    const send = vi.fn(async () => undefined);
    render(<TalkComposer send={send} />);
    expect((screen.getByRole('button', { name: 'Say it' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Say something to people nearby'), { target: { value: '    ' } });
    expect((screen.getByRole('button', { name: 'Say it' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the server’s reason and stays open when a line is refused', async () => {
    const send = vi.fn(async () => {
      throw new SpeechError('Keep phone and account numbers to yourself — strangers can read bubbles');
    });
    render(<TalkComposer send={send} />);
    fireEvent.change(screen.getByLabelText('Say something to people nearby'), { target: { value: 'call 08031234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Say it' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Keep phone and account numbers to yourself — strangers can read bubbles');
    expect(useSpeech.getState().composerOpen).toBe(true);
  });

  it(`caps input at ${SPEECH_MAX_LENGTH} characters and counts them`, () => {
    render(<TalkComposer send={vi.fn()} />);
    const input = screen.getByLabelText('Say something to people nearby') as HTMLInputElement;
    expect(input.maxLength).toBe(SPEECH_MAX_LENGTH);
    fireEvent.change(input, { target: { value: 'x'.repeat(SPEECH_MAX_LENGTH + 30) } });
    expect(input.value).toHaveLength(SPEECH_MAX_LENGTH);
    expect(screen.getByText(`${SPEECH_MAX_LENGTH}/${SPEECH_MAX_LENGTH}`)).toBeTruthy();
  });

  it('Esc and ✕ close it', () => {
    render(<TalkComposer send={vi.fn()} />);
    fireEvent.keyDown(screen.getByLabelText('Say something to people nearby'), { key: 'Escape' });
    expect(useSpeech.getState().composerOpen).toBe(false);
    useSpeech.setState({ composerOpen: true });
    fireEvent.click(screen.getByRole('button', { name: 'Close Talk' }));
    expect(useSpeech.getState().composerOpen).toBe(false);
  });

  it('has no mic where speech can’t be recognised on the device', async () => {
    (window as FakeWindow).webkitSpeechRecognition = class {};
    render(<TalkComposer send={vi.fn()} />);
    await act(async () => undefined);
    expect(screen.queryByRole('button', { name: /Dictate/ })).toBeNull();
  });

  it('dictates on the device into the box, after what was typed', async () => {
    const started = installRecogniser('see you at the bus stop');
    render(<TalkComposer send={vi.fn()} />);
    const mic = await screen.findByRole('button', { name: 'Dictate (speech to text on this device)' });
    const input = screen.getByLabelText('Say something to people nearby') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ok,' } });
    fireEvent.click(mic);
    // English from the browser's languages, processed on the device.
    expect(started).toHaveBeenCalledWith(expect.stringMatching(/^en-/), true);
    expect(input.value).toBe('Ok, see you at the bus stop');
  });

  it('shows what people nearby said above the box', () => {
    useSpeech.getState().hear(said(), Date.now());
    render(<TalkComposer send={vi.fn()} />);
    expect(screen.getByRole('list', { name: 'Said nearby' }).textContent).toContain('How far?');
  });
});

describe('withDictation', () => {
  it('appends dictated words to typed text within the cap', () => {
    expect(withDictation('', 'hello')).toBe('hello');
    expect(withDictation('Ok, ', 'hello')).toBe('Ok, hello');
    expect(withDictation('a'.repeat(SPEECH_MAX_LENGTH), 'more')).toHaveLength(SPEECH_MAX_LENGTH);
  });
});

describe('TalkButton and the T key', () => {
  it('opens the Talk box focused, and badges lines you missed', async () => {
    useSpeech.setState({ composerOpen: false, unread: 2 });
    render(
      <>
        <TalkButton />
        <TalkLayer />
      </>,
    );
    const button = screen.getByRole('button', { name: 'Talk to people nearby (2 new)' });
    fireEvent.click(button);
    expect(useSpeech.getState().composerOpen).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText('Say something to people nearby'));
    expect(useSpeech.getState().unread).toBe(0);
  });

  it('T opens it, but not while typing elsewhere or with the phone open', () => {
    useSpeech.setState({ composerOpen: false });
    render(
      <>
        <input aria-label="elsewhere" />
        <TalkLayer />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('elsewhere'), { code: 'KeyT', key: 't' });
    expect(useSpeech.getState().composerOpen).toBe(false);
    act(() => useUi.setState({ phoneOpen: true }));
    fireEvent.keyDown(window, { code: 'KeyT', key: 't' });
    expect(useSpeech.getState().composerOpen).toBe(false);
    act(() => useUi.setState({ phoneOpen: false }));
    fireEvent.keyDown(window, { code: 'KeyT', key: 't' });
    expect(useSpeech.getState().composerOpen).toBe(true);
  });

  it('closes when the phone opens', () => {
    render(<TalkLayer />);
    expect(screen.getByRole('region', { name: 'Talk to people nearby' })).toBeTruthy();
    act(() => useUi.setState({ phoneOpen: true }));
    expect(useSpeech.getState().composerOpen).toBe(false);
  });
});

describe('Nearby feed and announcer', () => {
  it('briefly shows the last few lines while the Talk box is closed (the HUD carries it)', () => {
    useSpeech.setState({ composerOpen: false });
    useSpeech.getState().hear(said(), Date.now());
    render(<TalkFeed />);
    expect(screen.getByTestId('nearby-feed').textContent).toContain('How far?');
    act(() => useSpeech.setState({ composerOpen: true }));
    expect(screen.queryByTestId('nearby-feed')).toBeNull();
  });

  it('drops lines older than a few seconds from the feed', () => {
    const lines = [{ ...said(), heardAt: Date.now() - 60_000, mine: false }];
    const { container } = render(<NearbyFeed lines={lines} />);
    expect(container.textContent).toBe('');
  });

  it('announces others politely, not your own lines', () => {
    const lines = [
      { ...said(), heardAt: 0, mine: false },
      { ...said({ id: 'l2', characterId: 'ada', handle: 'ada_b', firstName: 'Ada', text: 'I dey' }), heardAt: 0, mine: true },
    ];
    render(<NearbyAnnouncer lines={lines} />);
    const log = screen.getByRole('log');
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(log.textContent).toContain('Kemi (@kemi_o) says: How far?');
    expect(log.textContent).not.toContain('I dey');
  });

  it('labels how long ago a line was heard', () => {
    expect(agoLabel(0, 3_000)).toBe('now');
    expect(agoLabel(0, 42_000)).toBe('42s');
    expect(agoLabel(0, 185_000)).toBe('3m');
  });
});
