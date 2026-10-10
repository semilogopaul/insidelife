import { describe, expect, it } from 'vitest';
import type { VisitDto } from '@insidelife/shared';
import { expectedVisits, targetFromParam, targetLocationId, targetName } from '../services/targets';

const visit = (overrides: Partial<VisitDto> = {}): VisitDto =>
  ({
    id: 'v1',
    status: 'accepted',
    role: 'guest',
    host: { id: 'ada', handle: 'ada', firstName: 'Adaeze' },
    guest: { id: 'femi', handle: 'femi', firstName: 'Femi' },
    home: { locationId: 'home:ada', label: 'Family room, Ikorodu', districtId: 'ikorodu' },
    ...overrides,
  }) as unknown as VisitDto;

describe('Map destinations', () => {
  it('opens a host’s home from a deep link, not your own', () => {
    const target = targetFromParam('home:ada', 'home:femi', [visit()]);
    expect(target).toMatchObject({ kind: 'visit', locationId: 'home:ada', name: 'Adaeze’s place' });
    expect(target && targetLocationId(target, 'home:femi')).toBe('home:ada');
  });

  it('still opens your own home for `home` and `home:<you>`', () => {
    expect(targetFromParam('home', 'home:femi', [])).toEqual({ kind: 'home' });
    const own = targetFromParam('home:femi', 'home:femi', [visit()]);
    expect(own).toEqual({ kind: 'home' });
    expect(own && targetLocationId(own, 'home:femi')).toBe('home:femi');
    expect(own && targetName(own)).toBe('Home');
  });

  it('opens venues by id and ignores unknown ids', () => {
    expect(targetFromParam('berger-car-market', null, [])).toMatchObject({ kind: 'venue' });
    expect(targetFromParam('nowhere', null, [])).toBeNull();
  });

  it('lists the homes you’re expected at while the invite is accepted (and you’re not there yet)', () => {
    expect(expectedVisits([visit()], 'street:yaba')).toHaveLength(1);
    expect(expectedVisits([visit({ status: 'invited' })], 'street:yaba')).toHaveLength(0);
    expect(expectedVisits([visit()], 'home:ada')).toHaveLength(0);
  });
});
