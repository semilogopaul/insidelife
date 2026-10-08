import { Color } from 'three';

/**
 * Per-frame atmosphere values in linear colour, written once per frame by `<Atmosphere>` (priority -2) and read
 * by water, sky, rain, lights and signs. A plain mutable object: no React state, no allocations per frame.
 */
export const atmosphereFrame = {
  sunDirection: [0.3, 0.8, 0.3] as [number, number, number],
  lightDirection: [0.3, 0.8, 0.3] as [number, number, number],
  sunColor: new Color('#fff4e0'),
  top: new Color('#4a8bd0'),
  horizon: new Color('#d8e7ee'),
  /** Fog colour; the sky blends into it at the horizon so distant blocks dissolve seamlessly. */
  fog: new Color('#d8e7ee'),
  lagoon: new Color('#2b5f5c'),
  ocean: new Color('#1d5f78'),
  shallow: new Color('#4f9a8c'),
  night: 0,
  rain: 0,
  wet: 0,
  cloud: 0,
  haze: 0,
  stars: 0,
};
