import type {
  AircraftChangeResultDto,
  AircraftFlightRequest,
  AircraftFlightResultDto,
  AircraftLiveryRequest,
  AircraftPurchaseRequest,
  AircraftPurchaseResultDto,
  AircraftReinstatementResultDto,
  AircraftSaleResultDto,
  HangarDto,
  PilotTrainingStepResultDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

const id = (value: string): string => encodeURIComponent(value);

/** Aviation endpoints (all under /api/v1/aircraft). Every paid command is tap-once. */
export const hangarApi = {
  overview: () => api.get<HangarDto>('/aircraft'),
  purchase: (body: AircraftPurchaseRequest) =>
    tapOnce(`aircraft:${body.aircraftId}:${body.deliverTo ?? ''}:${body.registration ?? ''}`, (idempotencyKey) =>
      api.post<AircraftPurchaseResultDto>('/aircraft/purchases', { ...body, idempotencyKey }),
    ),
  sell: (aircraftId: string) =>
    tapOnce(`aircraft-sale:${aircraftId}`, (idempotencyKey) => api.post<AircraftSaleResultDto>(`/aircraft/${id(aircraftId)}/sale`, { idempotencyKey })),
  livery: (aircraftId: string, body: Omit<AircraftLiveryRequest, 'idempotencyKey'>) =>
    tapOnce(`aircraft-livery:${aircraftId}:${body.base}:${body.accent}`, (idempotencyKey) =>
      api.put<AircraftChangeResultDto>(`/aircraft/${id(aircraftId)}/livery`, { ...body, idempotencyKey }),
    ),
  name: (aircraftId: string, name: string) =>
    tapOnce(`aircraft-name:${aircraftId}:${name}`, (idempotencyKey) => api.put<AircraftChangeResultDto>(`/aircraft/${id(aircraftId)}/name`, { name, idempotencyKey })),
  registration: (aircraftId: string, registration: string) =>
    tapOnce(`aircraft-registration:${aircraftId}:${registration}`, (idempotencyKey) =>
      api.put<AircraftChangeResultDto>(`/aircraft/${id(aircraftId)}/registration`, { registration, idempotencyKey }),
    ),
  reinstate: (aircraftId: string) =>
    tapOnce(`aircraft-reinstate:${aircraftId}`, (idempotencyKey) =>
      api.post<AircraftReinstatementResultDto>(`/aircraft/${id(aircraftId)}/reinstatement`, { idempotencyKey }),
    ),
  fly: (aircraftId: string, body: Omit<AircraftFlightRequest, 'idempotencyKey'>) =>
    tapOnce(`aircraft-flight:${aircraftId}:${body.destination}`, (idempotencyKey) =>
      api.post<AircraftFlightResultDto>(`/aircraft/${id(aircraftId)}/flights`, { ...body, idempotencyKey }),
    ),
  enrol: () => tapOnce('ppl-enrol', (idempotencyKey) => api.post<PilotTrainingStepResultDto>('/aircraft/pilot-training/enrolment', { idempotencyKey })),
  lesson: () => tapOnce('ppl-lesson', (idempotencyKey) => api.post<PilotTrainingStepResultDto>('/aircraft/pilot-training/lessons', { idempotencyKey })),
  checkRide: () => tapOnce('ppl-check-ride', (idempotencyKey) => api.post<PilotTrainingStepResultDto>('/aircraft/pilot-training/check-rides', { idempotencyKey })),
};
