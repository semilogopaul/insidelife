import type { VehicleDefinition, VehicleModel, VehiclePerformance, VehicleSegment } from '@insidelife/shared';
import type { ReceiptLine } from '@/common/components';

export interface PerformanceBar {
  readonly key: keyof VehiclePerformance;
  readonly label: string;
  /** What's printed beside the bar ("210 km/h", "8.2 s"). */
  readonly value: string;
  /** 0-1, higher is better. */
  readonly ratio: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Performance as four comparable 0-1 bars (quicker 0-100 = longer bar). */
export function performanceBars(performance: VehiclePerformance): PerformanceBar[] {
  return [
    {
      key: 'topSpeedKmh',
      label: 'Top speed',
      value: `${performance.topSpeedKmh} km/h`,
      ratio: clamp01((performance.topSpeedKmh - 100) / 150),
    },
    {
      key: 'zeroToHundredSeconds',
      label: '0–100',
      value: `${performance.zeroToHundredSeconds.toFixed(1)} s`,
      ratio: clamp01((21 - performance.zeroToHundredSeconds) / 17),
    },
    {
      key: 'handling',
      label: 'Handling',
      value: `${Math.round(performance.handling * 10)}/10`,
      ratio: clamp01(performance.handling),
    },
    {
      key: 'braking',
      label: 'Braking',
      value: `${Math.round(performance.braking * 10)}/10`,
      ratio: clamp01(performance.braking),
    },
  ];
}

export type CarShape = 'sedan' | 'hatch' | 'suv' | 'van' | 'box' | 'pickup';

/** Which silhouette to draw for a Kenney model. */
export function carShape(model: VehicleModel): CarShape {
  switch (model) {
    case 'hatchback-sports':
      return 'hatch';
    case 'suv':
    case 'suv-luxury':
      return 'suv';
    case 'van':
      return 'van';
    case 'delivery':
      return 'box';
    case 'truck':
      return 'pickup';
    default:
      return 'sedan';
  }
}

export type SegmentFilter = VehicleSegment | 'all';

/** Filter by segment and budget, cheapest first. */
export function filterCatalogue<
  T extends { readonly vehicle: Pick<VehicleDefinition, 'segment'>; readonly price: number },
>(entries: readonly T[], segment: SegmentFilter, budget: number | null): T[] {
  return entries
    .filter(
      (entry) =>
        (segment === 'all' || entry.vehicle.segment === segment) &&
        (budget === null || entry.price <= budget),
    )
    .sort((a, b) => a.price - b.price);
}

/** Price (+ delivery when ordering remotely) as receipt lines. */
export function purchaseLines(
  price: number,
  deliveryFee: number,
  inPerson: boolean,
): { readonly lines: ReceiptLine[]; readonly total: number } {
  const lines: ReceiptLine[] = [{ label: 'Car', amount: price }];
  if (!inPerson)
    lines.push({
      label: 'Delivery to your gate',
      amount: deliveryFee,
      note: 'The dealer’s driver brings it',
    });
  return { lines, total: price + (inPerson ? 0 : deliveryFee) };
}

/** "Condition 64 — needs a mechanic soon". */
export function conditionWord(condition: number): string {
  if (condition < 10) return 'Won’t start';
  if (condition < 45) return 'Breakdowns likely';
  if (condition < 70) return 'Tired';
  if (condition < 90) return 'Good';
  return 'Mint';
}
