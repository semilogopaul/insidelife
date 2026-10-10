import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/common/game/ui-store';
import { useWorld } from '@/common/game/world-store';

// The HUD's data comes from the snapshot; the clean screen doesn't need any.
vi.mock('../hooks/use-hud-data', () => ({ useHudData: () => null }));
vi.mock('../hooks/use-suggestions', () => ({ useSuggestions: () => ({ data: [] }) }));

const { Hud } = await import('../components/Hud');
const { toggleHud } = await import('../hooks/use-clean-screen');

function renderHud() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Hud talk={<button type="button">Talk</button>} />
    </QueryClientProvider>,
  );
}

const hidden = () => useUi.getState().settings.hudHidden;

describe('clean screen', () => {
  beforeEach(() => {
    // jsdom has no media queries: a desktop with a mouse.
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    useUi.getState().updateSettings({ hudHidden: false });
    useUi.setState({ phoneOpen: false });
    useWorld.setState({ mode: 'walking' });
  });

  it('leaves only a small Show button, which brings the HUD back', () => {
    useUi.getState().updateSettings({ hudHidden: true });
    renderHud();
    expect(screen.queryByRole('button', { name: 'Talk' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show the HUD' }));
    expect(hidden()).toBe(false);
  });

  it('is remembered on this device', () => {
    toggleHud();
    expect(JSON.parse(window.localStorage.getItem('insidelife:ui') ?? '{}').state.settings.hudHidden).toBe(true);
    toggleHud();
    expect(JSON.parse(window.localStorage.getItem('insidelife:ui') ?? '{}').state.settings.hudHidden).toBe(false);
  });

  it('comes back by itself when you enter a place or get in or out of a car, not when you step outside', () => {
    vi.useFakeTimers();
    try {
      renderHud();
      act(() => useWorld.setState({ mode: 'loading' }));
      act(() => useWorld.setState({ mode: 'inside' }));
      act(() => vi.advanceTimersByTime(2_000));
      useUi.getState().updateSettings({ hudHidden: true });
      act(() => useWorld.setState({ mode: 'walking' }));
      expect(hidden()).toBe(true);
      act(() => useWorld.setState({ mode: 'driving' }));
      expect(hidden()).toBe(false);
      useUi.getState().updateSettings({ hudHidden: true });
      act(() => useWorld.setState({ mode: 'walking' }));
      expect(hidden()).toBe(false);
      useUi.getState().updateSettings({ hudHidden: true });
      act(() => useWorld.setState({ mode: 'inside' }));
      expect(hidden()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a reload keeps it hidden (the world settling in after loading isn’t a change)', () => {
    useUi.getState().updateSettings({ hudHidden: true });
    useWorld.setState({ mode: 'walking' });
    renderHud();
    act(() => useWorld.setState({ mode: 'loading' }));
    act(() => useWorld.setState({ mode: 'walking' }));
    act(() => useWorld.setState({ mode: 'driving' }));
    expect(hidden()).toBe(true);
  });

  it('H toggles it, except at the wheel (H is the horn) or while typing', () => {
    render(
      <>
        <input aria-label="chat" />
        <QueryClientProvider client={new QueryClient()}>
          <Hud />
        </QueryClientProvider>
      </>,
    );
    fireEvent.keyDown(window, { code: 'KeyH', key: 'h' });
    expect(hidden()).toBe(true);
    fireEvent.keyDown(window, { code: 'KeyH', key: 'h' });
    expect(hidden()).toBe(false);
    act(() => useWorld.setState({ mode: 'driving' }));
    fireEvent.keyDown(window, { code: 'KeyH', key: 'h' });
    expect(hidden()).toBe(false);
    act(() => useWorld.setState({ mode: 'walking' }));
    fireEvent.keyDown(screen.getByLabelText('chat'), { code: 'KeyH', key: 'h' });
    expect(hidden()).toBe(false);
  });
});
