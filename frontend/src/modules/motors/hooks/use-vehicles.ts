'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VehiclePurchaseRequest } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { motorsApi } from '../services/motors.api';
import { useCurrentPlace } from '@/common/hooks/use-current-place';
import { newIdempotencyKey } from '@/common/utils/money-input';

const vehiclesPrefix = queryKeys.domain('vehicles');

/** Garage, dealer catalogue and licence — keyed by location (`atDealer`, `buyHere` depend on where you stand). */
export function useVehicles() {
  const { locationId } = useCurrentPlace();
  return useQuery({
    queryKey: queryKeys.domain('vehicles', locationId ?? 'unknown'),
    queryFn: motorsApi.overview,
    // Moving between places changes the key: keep showing the last view while the new one loads.
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useVehicleCommands() {
  const client = useQueryClient();
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: vehiclesPrefix });
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
  };
  return {
    purchase: useMutation({
      mutationFn: (body: VehiclePurchaseRequest) => motorsApi.purchase(body),
      onSuccess: refresh,
    }),
    applyForLicence: useMutation({ mutationFn: motorsApi.applyForLicence, onSuccess: refresh }),
    setPrimary: useMutation({ mutationFn: motorsApi.setPrimary, onSuccess: refresh }),
    sell: useMutation({ mutationFn: motorsApi.sell, onSuccess: refresh }),
    repair: useMutation({ mutationFn: motorsApi.repair, onSuccess: refresh }),
    roadside: useMutation({ mutationFn: (vehicleId: string) => motorsApi.roadside(vehicleId, newIdempotencyKey()), onSuccess: refresh }),
    jerrycan: useMutation({ mutationFn: (vehicleId: string) => motorsApi.jerrycan(vehicleId, newIdempotencyKey()), onSuccess: refresh }),
  };
}
