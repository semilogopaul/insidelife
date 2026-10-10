import {
  FUEL_TOP_UP_LITRES,
  findVehicle,
  formatNaira,
  pumpPricePerLitre,
  workshopRepairCost,
  type DrivenVehicleDto,
  type ServicePoint,
} from '@insidelife/shared';
import type { Interactable } from '@/common/game/world-store';

/**
 * What the context button (or the drive controls) offers at a filling station or a mechanic workshop, priced like the
 * server will charge (it charges, the client only shows). Pure.
 */

export interface RunningCar {
  readonly vehicle: DrivenVehicleDto;
  readonly running: { readonly fuelLitres: number; readonly tankLitres: number; readonly condition: number; readonly brokenDown: boolean };
}

export interface ServicePrices {
  /** World petrol price per litre (₦, scarcity included). */
  readonly fuelPrice: number;
  readonly priceIndex: number;
  /** This station has nothing to sell today (fuel scarcity; `fuelStationDry`). */
  readonly dry?: boolean;
}

/** `play:service|<point id>` (+ `|<litres>` for a partial fill). */
export function serviceActionId(pointId: string, litres?: number): string {
  return litres ? `play:service|${pointId}|${litres}` : `play:service|${pointId}`;
}

export function parseServiceAction(id: string): { readonly pointId: string; readonly litres: number | null } | null {
  if (!id.startsWith('play:service|')) return null;
  const [, pointId, litres] = id.split('|');
  if (!pointId) return null;
  const amount = litres ? Number(litres) : Number.NaN;
  return { pointId, litres: Number.isFinite(amount) && amount > 0 ? amount : null };
}

export function serviceOffer(point: ServicePoint, car: RunningCar, prices: ServicePrices): Interactable {
  if (point.kind === 'fuel') {
    const pump = pumpPricePerLitre(prices.fuelPrice, car.vehicle.fuelType);
    const room = Math.max(0, car.running.tankLitres - car.running.fuelLitres);
    if (prices.dry) return { id: serviceActionId(point.id), kind: 'car', emoji: '⛽', label: point.name, disabled: 'No fuel here today (scarcity): try another station' };
    if (room < 0.5) return { id: serviceActionId(point.id), kind: 'car', emoji: '⛽', label: point.name, disabled: 'Your tank is full' };
    const more =
      room > FUEL_TOP_UP_LITRES + 2
        ? [{ id: serviceActionId(point.id, FUEL_TOP_UP_LITRES), emoji: '⛽', label: `Buy ${FUEL_TOP_UP_LITRES} L · ${formatNaira(Math.round(FUEL_TOP_UP_LITRES * pump))}` }]
        : undefined;
    const litres = Math.round(room * 10) / 10;
    return { id: serviceActionId(point.id), kind: 'car', emoji: '⛽', label: `Fill up · ${Math.round(litres)} L · ${formatNaira(Math.round(litres * pump))}`, ...(more ? { more } : {}) };
  }
  const def = findVehicle(car.vehicle.vehicleId);
  const cost = def ? workshopRepairCost(def, car.running.condition, car.running.brokenDown, prices.priceIndex) : 0;
  if (cost === 0) return { id: serviceActionId(point.id), kind: 'car', emoji: '🔧', label: point.name, disabled: 'Your car is in top shape' };
  return { id: serviceActionId(point.id), kind: 'car', emoji: '🔧', label: `${car.running.brokenDown ? 'Fix the breakdown' : 'Service & repair'} · ${formatNaira(cost)}` };
}
