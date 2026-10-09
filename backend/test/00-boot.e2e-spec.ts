import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STARTER_FUND } from '@insidelife/shared';
import { bootApp, type E2eApp } from './support/app.js';
import { createPlayer, ok } from './support/players.js';

let e2e: E2eApp;

beforeAll(async () => {
  e2e = await bootApp();
});

afterAll(async () => {
  await e2e?.close();
});

describe('boot', () => {
  it('boots the real app and answers', async () => {
    const player = await createPlayer(e2e);
    const snapshot = await player.snapshot();
    expect(snapshot.wallet.balance).toBeGreaterThanOrEqual(STARTER_FUND);
    expect(ok<{ status: string }>(await player.get('/api/health')).status).toBe('ok');
  });
});
