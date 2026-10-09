import { describe, expect, it } from 'vitest';
import { getTemplate } from '../../interiors/templates/registry';
import { roomAnchors } from '../effects/moments/anchors';

describe('roomAnchors (where club moments play)', () => {
  it('finds the club’s LED wall, VIP sign, DJ booth and bar', () => {
    const club = roomAnchors(getTemplate('club'));
    expect(club.led).not.toBeNull();
    expect(club.vip).not.toBeNull();
    // The LED wall is the big back-wall screen, not the VIP sign.
    expect(club.led!.size[0]).toBeGreaterThan(club.vip!.size[0]);
    expect(club.dj[1]).toBeGreaterThan(1);
    expect(club.sides[0][0]).toBeLessThan(club.sides[1][0]);
    for (const point of [club.floor, club.stage, club.dj, club.bar, club.table, ...club.sides]) {
      expect(Math.abs(point[0])).toBeLessThan(6);
      expect(Math.abs(point[2])).toBeLessThan(5);
    }
  });

  it('falls back sensibly in a bar, an event hall and a room with no club props', () => {
    for (const id of ['bar', 'event-centre', 'buka'] as const) {
      const anchors = roomAnchors(getTemplate(id));
      expect(anchors.ceiling).toBeGreaterThan(2);
      for (const point of [anchors.floor, anchors.stage, anchors.dj, anchors.bar, anchors.table, ...anchors.sides]) {
        expect(point.every(Number.isFinite), id).toBe(true);
      }
    }
  });
});
