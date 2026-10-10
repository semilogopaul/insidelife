import { describe, expect, it, vi } from 'vitest';
import { tapOnce } from '../tap-once';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('tapOnce', () => {
  it('sends one request for a double tap and gives both taps its result', async () => {
    const reply = deferred<string>();
    const send = vi.fn(() => reply.promise);
    const first = tapOnce('shop:rice:1', send);
    const second = tapOnce('shop:rice:1', send);
    reply.resolve('bought');
    await expect(first).resolves.toBe('bought');
    await expect(second).resolves.toBe('bought');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries a failed purchase with the same key, then uses a new key once it went through', async () => {
    const keys: string[] = [];
    const failing = (key: string) => {
      keys.push(key);
      return Promise.reject(new Error('network'));
    };
    const working = (key: string) => {
      keys.push(key);
      return Promise.resolve('ok');
    };
    await expect(tapOnce('car:danfo:red', failing)).rejects.toThrow('network');
    await expect(tapOnce('car:danfo:red', working)).resolves.toBe('ok');
    await expect(tapOnce('car:danfo:red', working)).resolves.toBe('ok');
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('keeps different purchases apart', async () => {
    const keys: string[] = [];
    const send = (key: string) => {
      keys.push(key);
      return Promise.resolve(key);
    };
    await Promise.all([tapOnce('lease:a', send), tapOnce('lease:b', send)]);
    expect(new Set(keys).size).toBe(2);
  });
});
