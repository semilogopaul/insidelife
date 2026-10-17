import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OnboardingDto } from '@insidelife/shared';
import { bootApp, type E2eApp } from './support/app.js';
import { createPlayer, ok, refused } from './support/players.js';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await bootApp();
});
afterAll(async () => {
  await e2e?.close();
});

describe("What's new announcements", () => {
  it('start unseen, are recorded on the account once, and survive a second device', async () => {
    const player = await createPlayer(e2e);
    expect(ok<OnboardingDto>(await player.get('/account/onboarding')).lastAnnouncementSeen).toBeNull();
    const seen = ok<OnboardingDto>(await player.post('/account/onboarding/announcement', { id: 'private-jets-abuja' }));
    expect(seen.lastAnnouncementSeen).toBe('private-jets-abuja');
    expect(ok<OnboardingDto>(await player.get('/account/onboarding')).lastAnnouncementSeen).toBe('private-jets-abuja');
    // Recording it again changes nothing.
    expect(ok<OnboardingDto>(await player.post('/account/onboarding/announcement', { id: 'private-jets-abuja' })).lastAnnouncementSeen).toBe('private-jets-abuja');
  });

  it('refuses an id that is not in the catalog', async () => {
    const player = await createPlayer(e2e);
    refused(await player.post('/account/onboarding/announcement', { id: 'nope' }), 400);
  });
});
