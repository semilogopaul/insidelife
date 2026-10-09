import { describe, expect, it } from 'vitest';
import { useUi } from '@/common/game/ui-store';
import { openNightOut, useNightOutNav } from '../nav';

describe('openNightOut (hotspot entry point)', () => {
  it('opens Gist → Here and asks for the section, once per tap', () => {
    openNightOut('shoutout');
    expect(useUi.getState()).toMatchObject({ phoneOpen: true, phoneApp: 'gist', phoneParam: 'here' });
    const first = useNightOutNav.getState().request;
    expect(first?.section).toBe('shoutout');
    openNightOut('bottles');
    const second = useNightOutNav.getState().request;
    expect(second?.section).toBe('bottles');
    expect(second?.nonce).toBeGreaterThan(first?.nonce ?? 0);
    useNightOutNav.getState().consume();
    expect(useNightOutNav.getState().request).toBeNull();
  });
});
