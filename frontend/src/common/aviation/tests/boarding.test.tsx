import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aircraftLocationId, type CharacterSnapshotDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { useAboard } from '../aboard-store';
import { useAircraftBoarding } from '../use-aviation';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('@/common/api/http', () => ({ api: http }));

const PLANE = '11111111-1111-4111-8111-111111111111';
const snapshotAt = (locationId: string): CharacterSnapshotDto => ({ character: { locationId } }) as unknown as CharacterSnapshotDto;

let client: QueryClient;
const wrapper = ({ children }: { readonly children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  http.delete.mockReset();
  useAboard.getState().reset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.snapshot, snapshotAt('mmia-gat'));
});

describe('useAircraftBoarding', () => {
  it('boards through the server: the cabin shows at once, then the snapshot carries aircraft:<id>', async () => {
    http.post.mockResolvedValue({ aboard: true, locationId: aircraftLocationId(PLANE), aircraft: {} });
    const { result } = renderHook(() => useAircraftBoarding(), { wrapper });
    act(() => result.current.board(PLANE));
    expect(useAboard.getState()).toMatchObject({ aircraftId: PLANE, syncing: true });
    await waitFor(() => expect(useAboard.getState().syncing).toBe(false));
    expect(http.post).toHaveBeenCalledWith(`/aircraft/${PLANE}/boarding`);
    expect(client.getQueryData<CharacterSnapshotDto>(queryKeys.snapshot)?.character.locationId).toBe(aircraftLocationId(PLANE));
    expect(useAboard.getState().aircraftId).toBe(PLANE);
  });

  it('forgets the boarding when the server refuses', async () => {
    http.post.mockRejectedValue(new Error('Your aircraft is parked at another terminal'));
    const { result } = renderHook(() => useAircraftBoarding(), { wrapper });
    act(() => result.current.board(PLANE));
    await waitFor(() => expect(useAboard.getState().syncing).toBe(false));
    expect(useAboard.getState().aircraftId).toBeNull();
    expect(client.getQueryData<CharacterSnapshotDto>(queryKeys.snapshot)?.character.locationId).toBe('mmia-gat');
  });

  it('steps out to the terminal floor and opens the apron; a refusal puts you back aboard', async () => {
    client.setQueryData(queryKeys.snapshot, snapshotAt(aircraftLocationId(PLANE)));
    useAboard.setState({ aircraftId: PLANE });
    http.delete.mockResolvedValue({ aboard: false, locationId: 'mmia-gat', aircraft: {} });
    const { result } = renderHook(() => useAircraftBoarding(), { wrapper });
    act(() => result.current.deplane(PLANE));
    expect(useAboard.getState()).toMatchObject({ aircraftId: null, returnToAirside: true });
    await waitFor(() => expect(useAboard.getState().syncing).toBe(false));
    expect(http.delete).toHaveBeenCalledWith(`/aircraft/${PLANE}/boarding`);
    expect(client.getQueryData<CharacterSnapshotDto>(queryKeys.snapshot)?.character.locationId).toBe('mmia-gat');

    http.delete.mockRejectedValue(new Error('Stay in your seat until you land'));
    act(() => result.current.deplane(PLANE));
    await waitFor(() => expect(useAboard.getState().aircraftId).toBe(PLANE));
    expect(useAboard.getState().returnToAirside).toBe(false);
  });
});
