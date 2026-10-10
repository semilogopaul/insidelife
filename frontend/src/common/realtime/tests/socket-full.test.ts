import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

const fake = vi.hoisted(() => {
  const listeners = new Map<string, Listener>();
  return {
    listeners,
    connect: vi.fn(),
    disconnect: vi.fn(),
    socket: {
      connected: false,
      on: (event: string, listener: Listener) => listeners.set(event, listener),
      off: vi.fn(),
      connect: () => fake.connect(),
      disconnect: () => fake.disconnect(),
    },
  };
});

vi.mock('socket.io-client', () => ({ io: () => fake.socket }));
vi.mock('@/common/api/http', () => ({ freshAccessToken: async () => 'token', refreshSession: vi.fn(async () => true) }));

describe('realtime socket at the players-online cap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.connect.mockClear();
    fake.listeners.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('shows the full state on world:full, retries by itself within 20-40 s and clears once placed', async () => {
    const { connectSocket, disconnectSocket, useConnection } = await import('../socket');
    connectSocket();
    expect(fake.connect).toHaveBeenCalledTimes(1);

    fake.listeners.get('world:full')!({ retryAfterSeconds: 30 });
    fake.listeners.get('disconnect')!('io server disconnect');
    expect(useConnection.getState().full).toBe(true);

    vi.advanceTimersByTime(19_999);
    expect(fake.connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_001);
    expect(fake.connect).toHaveBeenCalledTimes(2);

    fake.listeners.get('world:instance')!({ id: 'lagos-1', players: 3 });
    expect(useConnection.getState().full).toBe(false);

    // A later server close is not mistaken for a full world (and no stray retry fires).
    vi.advanceTimersByTime(60_000);
    expect(fake.connect).toHaveBeenCalledTimes(2);
    disconnectSocket();
  });
});
