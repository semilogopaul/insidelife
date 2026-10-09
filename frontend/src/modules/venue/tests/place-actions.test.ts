import type { CharacterSnapshotDto } from '@insidelife/shared';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePlaceActions } from '../hooks/use-place-actions';

const snapshotAt = (locationId: string) =>
  ({
    character: { id: 'me', locationId },
    travel: null,
    summary: { home: { label: 'Mini flat, Yaba' } },
  }) as unknown as CharacterSnapshotDto;

describe('place actions', () => {
  it('lists home actions at home, never the guest-only ones', () => {
    const { result } = renderHook(() => usePlaceActions(snapshotAt('home:me')));
    const ids = result.current.actions.map((action) => action.id);
    expect(result.current.place?.kind).toBe('home');
    expect(ids).toContain('sleep');
    expect(ids).not.toContain('visit-hangout');
  });

  it('at a friend’s place: their name, hang out, no sleeping in their bed', () => {
    const { result } = renderHook(() => usePlaceActions(snapshotAt('home:ada'), 'Ada'));
    const ids = result.current.actions.map((action) => action.id);
    expect(result.current.place).toMatchObject({ kind: 'visit', name: 'Ada’s place' });
    expect(ids).toContain('visit-hangout');
    expect(ids).not.toContain('sleep');
    expect(ids).not.toContain('cook');
  });
});
