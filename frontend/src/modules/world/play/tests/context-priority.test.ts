import { describe, expect, it } from 'vitest';
import type { Interactable } from '@/common/game/world-store';
import { pickContext, rankContext, type ContextCandidate } from '../flow/context-priority';

const mechanicTopShape: Interactable = { id: 'play:service|mechanic:1:1', kind: 'car', label: 'Mobolaji Bank Anthony Way', disabled: 'Your car is in top shape' };
const home: Interactable = { id: 'play:door:home', kind: 'door', label: 'Go inside', locationId: 'home' };
const shop: Interactable = { id: 'play:door:shop', kind: 'door', label: 'Enter Shop', locationId: 'shop' };
const pump: Interactable = { id: 'play:service|fuel:1:1', kind: 'car', label: 'Fill up' };

const c = (item: Interactable, distance: number, entrance: boolean): ContextCandidate => ({ item, distance, entrance });

describe('context priority', () => {
  it('never lets a disabled card hide an enabled option, even a nearer one', () => {
    expect(pickContext([c(mechanicTopShape, 1, false), c(home, 6, true)])?.id).toBe(home.id);
  });

  it('shows the disabled card only when nothing enabled is in range', () => {
    expect(pickContext([c(mechanicTopShape, 3, false)])?.id).toBe(mechanicTopShape.id);
    expect(pickContext([])).toBeNull();
  });

  it('puts a door ahead of a service point, then the nearest', () => {
    expect(rankContext([c(pump, 2, false), c(home, 6, true)])[0]?.item.id).toBe(home.id);
    expect(rankContext([c(home, 6, true), c(shop, 4, true)])[0]?.item.id).toBe(shop.id);
  });

  it('lets the player switch between enabled options and wraps; a lone option has no choices', () => {
    const both = [c(home, 2, true), c(shop, 4, true), c(mechanicTopShape, 1, false)];
    expect(pickContext(both, 0)).toMatchObject({ id: home.id, choices: 2 });
    expect(pickContext(both, 1)).toMatchObject({ id: shop.id, choices: 2 });
    expect(pickContext(both, 2)?.id).toBe(home.id);
    expect(pickContext([c(home, 2, true)], 5)?.choices).toBeUndefined();
  });
});
