import { describe, expect, it } from 'vitest';
import { useUi } from '@/common/game/ui-store';
import { inStickZone } from '../overlay/PointerLayer';

describe('walking stick side', () => {
  it('defaults to the right thumb', () => {
    expect(useUi.getState().settings.walkStick).toBe('right');
  });

  it('grabs the stick on the chosen side; the other side looks around', () => {
    expect(inStickZone('right', 350, 390)).toBe(true);
    expect(inStickZone('right', 40, 390)).toBe(false);
    expect(inStickZone('left', 40, 390)).toBe(true);
    expect(inStickZone('left', 350, 390)).toBe(false);
    // The middle strip always looks around.
    expect(inStickZone('right', 195, 390)).toBe(false);
    expect(inStickZone('left', 195, 390)).toBe(false);
  });

  it('keeps settings saved before the option existed, filling it with the default', async () => {
    window.localStorage.setItem(
      'insidelife:ui',
      JSON.stringify({ state: { settings: { musicVolume: 0.2, graphics: 'low' } }, version: 0 }),
    );
    await useUi.persist.rehydrate();
    const { settings } = useUi.getState();
    expect(settings.musicVolume).toBe(0.2);
    expect(settings.graphics).toBe('low');
    expect(settings.walkStick).toBe('right');
    useUi.getState().updateSettings({ walkStick: 'left' });
    expect(JSON.parse(window.localStorage.getItem('insidelife:ui') ?? '{}').state.settings.walkStick).toBe(
      'left',
    );
  });
});
