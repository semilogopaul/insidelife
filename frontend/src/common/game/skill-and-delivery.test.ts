import { describe, expect, it } from 'vitest';
import type { CharacterSnapshotDto, Skills } from '@insidelife/shared';
import { deliveryToast, pendingDelivery } from './delivery-arrival';
import { formatSkillGain, skillGains, skillsMentioned } from './skill-changes';

const skills = (patch: Partial<Skills>): Skills =>
  ({ intellect: 0, tech: 0, finance: 0, medicine: 0, law: 0, engineering: 0, business: 0, creative: 0, charisma: 0, fitness: 0, cooking: 0, trade: 0, hustle: 0, ...patch }) as Skills;

describe('skill changes', () => {
  it('lists only skills that rose and formats them', () => {
    const gains = skillGains(skills({ trade: 24, tech: 5 }), skills({ trade: 27.2, tech: 5 }));
    expect(gains).toHaveLength(1);
    expect(formatSkillGain(gains[0]!)).toBe('Handiwork +3 → 27');
    expect(formatSkillGain({ skill: 'tech', before: 5, after: 5.4 })).toBe('Tech +0.4 → 5.4');
  });

  it('finds skills mentioned in goal text', () => {
    expect(skillsMentioned('Practise a trade until Handiwork reaches 30')).toEqual(['trade']);
    expect(skillsMentioned('Get your tech skill to 30')).toEqual(['tech']);
    expect(skillsMentioned('Write JAMB')).toEqual([]);
  });
});

describe('delivery arrival', () => {
  const profile = { energy: { target: 50, rate: 0 }, hunger: { target: 100, rate: 140 }, hygiene: { target: 50, rate: 0 }, fun: { target: 50, rate: 0 }, social: { target: 50, rate: 0 } };
  const snapshot = (actionId: string, locationId = 'home:c1'): CharacterSnapshotDto =>
    ({
      asOf: 1000,
      character: { id: 'c1', needs: { energy: 50, hunger: 20, hygiene: 50, fun: 50, social: 50 } },
      timeline: [{ kind: 'action', actionId, explicit: true, startsAt: 1000, endsAt: 1025, locationId, label: 'x', profile }],
    }) as unknown as CharacterSnapshotDto;

  it('announces a Chowdeck order with its hunger effect, at home', () => {
    const arrival = pendingDelivery(snapshot('order-food'));
    expect(arrival?.atHome).toBe(true);
    const toast = deliveryToast(arrival!);
    expect(toast.title).toMatch(/^Your Chowdeck order arrived: /);
    expect(toast.body).toMatch(/Hunger 20% → \d+%/);
  });

  it('ignores ordinary actions', () => {
    expect(pendingDelivery(snapshot('eat-buka'))).toBeNull();
  });
});
