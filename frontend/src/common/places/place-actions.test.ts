import { findAction, type ActionDefinition, type CharacterSnapshotDto } from '@insidelife/shared';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { actionPriceNote, actionsAt, isBusy, isPlaceAction, usePlaceActions } from './place-actions';

const snapshotAt = (locationId: string, timeline: unknown[] = []) =>
  ({
    character: { id: 'me', locationId },
    travel: null,
    timeline,
    summary: { home: { label: 'Mini flat, Yaba' } },
  }) as unknown as CharacterSnapshotDto;

const action = (id: string): ActionDefinition => findAction(id) as ActionDefinition;

const stayingAt = (locationId: string, stayVenueId: string | null) =>
  ({
    character: { id: 'me', locationId },
    travel: null,
    timeline: [],
    summary: { home: { label: 'Mini flat, Yaba' }, stay: stayVenueId ? { stayId: 's1', venueId: stayVenueId, name: 'Hotel', cityId: 'abuja', districtId: 'maitama', checkoutAt: 9999 } : null },
  }) as unknown as CharacterSnapshotDto;

describe('hotels', () => {
  it('offer only the bar, restaurant, pool and gym the hotel has', () => {
    const ids = (venue: string) => renderHook(() => usePlaceActions(stayingAt(venue, null))).result.current.actions.map((candidate) => candidate.id);
    expect(ids('transcorp-hilton')).toEqual(expect.arrayContaining(['hotel-bar', 'hotel-restaurant', 'hotel-pool', 'hotel-gym']));
    const chelsea = ids('chelsea-hotel-abuja');
    expect(chelsea).toEqual(expect.arrayContaining(['hotel-bar', 'hotel-restaurant']));
    expect(chelsea).not.toContain('hotel-pool');
    expect(chelsea).not.toContain('hotel-gym');
  });

  it('give a guest their room (sleep, nap, shower) and nothing else of home; a visitor gets none of it', () => {
    const guest = renderHook(() => usePlaceActions(stayingAt('transcorp-hilton', 'transcorp-hilton'))).result.current.actions.map((candidate) => candidate.id);
    expect(guest).toEqual(expect.arrayContaining(['sleep', 'nap', 'shower', 'hotel-bar']));
    expect(guest).not.toContain('cook');
    expect(guest).not.toContain('watch-tv');
    const visitor = renderHook(() => usePlaceActions(stayingAt('transcorp-hilton', null))).result.current.actions.map((candidate) => candidate.id);
    expect(visitor).not.toContain('sleep');
    const otherHotel = renderHook(() => usePlaceActions(stayingAt('sheraton-abuja', 'transcorp-hilton'))).result.current.actions.map((candidate) => candidate.id);
    expect(otherHotel).not.toContain('sleep');
  });
});

describe('place actions', () => {
  it('lists home actions at home, never the guest-only ones', () => {
    const { result } = renderHook(() => usePlaceActions(snapshotAt('home:me')));
    const ids = result.current.actions.map((candidate) => candidate.id);
    expect(result.current.place?.kind).toBe('home');
    expect(ids).toContain('sleep');
    expect(ids).not.toContain('visit-hangout');
  });

  it('at a friend’s place: their name, hang out, no sleeping in their bed', () => {
    const { result } = renderHook(() => usePlaceActions(snapshotAt('home:ada'), 'Ada'));
    const ids = result.current.actions.map((candidate) => candidate.id);
    expect(result.current.place).toMatchObject({ kind: 'visit', name: 'Ada’s place' });
    expect(ids).toContain('visit-hangout');
    expect(ids).not.toContain('sleep');
    expect(ids).not.toContain('cook');
  });

  it('at the Ozumba lounge: drinks and mingling, plus the do-anywhere ones; never engine-managed actions', () => {
    const { result } = renderHook(() => usePlaceActions(snapshotAt('vi-lounge')));
    const ids = result.current.actions.map((candidate) => candidate.id);
    expect(result.current.place).toMatchObject({ kind: 'venue', name: 'Ozumba Rooftop Lounge' });
    expect(ids).toEqual(expect.arrayContaining(['lounge', 'meet-people', 'scroll']));
    expect(ids).not.toContain('hang-around');
    const own = result.current.actions.filter(isPlaceAction).map((candidate) => candidate.id);
    expect(own).toEqual(expect.arrayContaining(['lounge', 'meet-people']));
    expect(own).not.toContain('scroll');
  });

  it('lists by kind of place without a session (dev previews)', () => {
    expect(actionsAt({ kind: 'venue', venueType: 'club' }).map((candidate) => candidate.id)).toContain(
      'club-night',
    );
    expect(actionsAt({ kind: 'venue', venueType: null }).every((candidate) => candidate.where.anywhere)).toBe(
      true,
    );
  });

  it('prices with the world index, or says the kitchen pays', () => {
    expect(actionPriceNote(action('lounge'), 1)).toBe('₦18,000');
    expect(actionPriceNote(action('lounge'), 1.1)).toBe('₦19,800');
    expect(actionPriceNote(action('meet-people'), 1)).toBe('');
    expect(actionPriceNote(action('cook'), 1, 3)).toBe('from your kitchen');
  });

  it('is busy only with something the player chose that can’t be interrupted', () => {
    expect(isBusy(snapshotAt('vi-lounge', [{ kind: 'action', explicit: true, actionId: 'lounge' }]))).toBe(
      true,
    );
    expect(
      isBusy(snapshotAt('vi-lounge', [{ kind: 'action', explicit: true, actionId: 'hang-around' }])),
    ).toBe(false);
    expect(isBusy(snapshotAt('vi-lounge', [{ kind: 'action', explicit: false, actionId: 'lounge' }]))).toBe(
      false,
    );
    expect(isBusy(snapshotAt('vi-lounge'))).toBe(false);
  });

  it('stops being busy the moment the activity ends, even before the snapshot refreshes', () => {
    const snap = snapshotAt('vi-lounge', [{ kind: 'action', explicit: true, actionId: 'lounge', startsAt: 100, endsAt: 160 }]);
    expect(isBusy(snap, 159)).toBe(true);
    expect(isBusy(snap, 160)).toBe(false);
    expect(isBusy(snap, 500)).toBe(false);
  });
});
