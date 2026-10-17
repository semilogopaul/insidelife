import { venueLot } from '@insidelife/shared';
import { APRON, frameOf, type LotFrame } from './placements';

/**
 * Sizes of the airport landmarks in lot-local space (x right when facing the lot from the road, z towards the road): the
 * commercial terminals (`mmia-airport`, `naia-airport`) and the General Aviation Terminals (`mmia-gat`, `naia-gat`). The
 * landmark geometry draws them and the play layer's colliders read the same numbers, so what you see is what you bump into.
 */

/** Commercial airports, by venue id; everything else about a terminal follows from its lot. */
export const AIRPORT_TERMINAL_IDS = ['mmia-airport', 'naia-airport'] as const;
export const GAT_TERMINAL_IDS = ['mmia-gat', 'naia-gat'] as const;

export interface AirportSpec {
  readonly frame: LotFrame;
  /** Terminal block width/depth/height, centred at x = 0, its back at `back + 4`. */
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** z of the terminal's centre. */
  readonly centreZ: number;
  /** Control tower: x, z of its centre and height. */
  readonly tower: { readonly x: number; readonly z: number; readonly height: number };
  /** Abuja's terminal wears a second storey and a green roof band. */
  readonly twoStorey: boolean;
}

/** The commercial terminal for a lot: 60 m wide on Lagos's 86 m lot (as it always was), wider on Abuja's. */
export function airportSpec(venueId: string): AirportSpec | null {
  const lot = venueLot(venueId);
  if (!lot) return null;
  const frame = frameOf(lot);
  const width = Math.min(frame.width - 26, 90);
  const depth = frame.depth > 56 ? 24 : 18;
  const back = -frame.depth / 2;
  return {
    frame,
    width,
    depth,
    height: 11,
    centreZ: back + 4 + depth / 2,
    tower: { x: width / 2 + 4, z: back + 9, height: 34 },
    twoStorey: venueId === 'naia-airport',
  };
}

export interface GatSpec {
  readonly frame: LotFrame;
  /** The lounge: low, glassy, near the road. */
  readonly lounge: { readonly x: number; readonly z: number; readonly halfW: number; readonly halfD: number; readonly height: number };
  /** The hangar behind it: a barrel-roofed shed. */
  readonly hangar: { readonly x: number; readonly z: number; readonly halfW: number; readonly halfD: number; readonly height: number };
  /** Small control cab beside the lounge. */
  readonly tower: { readonly x: number; readonly z: number; readonly height: number };
}

export function gatSpec(venueId: string): GatSpec | null {
  const lot = venueLot(venueId);
  if (!lot) return null;
  const frame = frameOf(lot);
  const front = frame.depth / 2 - APRON;
  const halfW = Math.min(frame.width / 2 - 3, 24);
  const loungeD = Math.min(7, Math.max(5, frame.depth * 0.18));
  const hangarD = Math.min(14, frame.depth * 0.3);
  return {
    frame,
    lounge: { x: -halfW * 0.18, z: front - 2 - loungeD / 2, halfW: halfW * 0.78, halfD: loungeD / 2, height: 5 },
    hangar: { x: 0, z: -frame.depth / 2 + 2 + hangarD / 2, halfW, halfD: hangarD / 2, height: 8.5 },
    tower: { x: halfW * 0.8, z: front - 2 - loungeD / 2, height: 13 },
  };
}
