/** Sky gradient stops for a given hour (0-24, fractional). Shared by the landing skyline and loading screens. */
interface SkyStops {
  readonly top: string;
  readonly mid: string;
  readonly horizon: string;
  readonly water: string;
  readonly sun: string;
  readonly night: number;
}

const KEYFRAMES: ReadonlyArray<readonly [number, SkyStops]> = [
  [0, { top: '#071a24', mid: '#0e2733', horizon: '#1d3f4f', water: '#0a1f29', sun: '#f4f1d0', night: 1 }],
  [5.5, { top: '#16304a', mid: '#3d4d6e', horizon: '#c7856a', water: '#1b3344', sun: '#ffd27a', night: 0.6 }],
  [7, { top: '#3f7fb0', mid: '#8fb9d4', horizon: '#f6cf8a', water: '#2a6478', sun: '#fff1c2', night: 0 }],
  [12, { top: '#2f86c9', mid: '#7fbde4', horizon: '#d8ecf2', water: '#2d7488', sun: '#fffbe8', night: 0 }],
  [17, { top: '#3a6fa8', mid: '#e0a25e', horizon: '#f6b90b', water: '#305f6b', sun: '#ffd27a', night: 0 }],
  [18.6, { top: '#2b3466', mid: '#b3495b', horizon: '#f08a3c', water: '#28394f', sun: '#ff9d4d', night: 0.35 }],
  [20, { top: '#0b1e33', mid: '#18304a', horizon: '#3b3f63', water: '#0d2232', sun: '#f4f1d0', night: 0.9 }],
  [24, { top: '#071a24', mid: '#0e2733', horizon: '#1d3f4f', water: '#0a1f29', sun: '#f4f1d0', night: 1 }],
];

const hexToRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x: number, y: number): number => Math.round(x + (y - x) * t);
  return `rgb(${c(ar, br)} ${c(ag, bg)} ${c(ab, bb)})`;
};

export function skyAt(hour: number): SkyStops {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const [h0, a] = KEYFRAMES[i]!;
    const [h1, b] = KEYFRAMES[i + 1]!;
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return {
        top: mix(a.top, b.top, t),
        mid: mix(a.mid, b.mid, t),
        horizon: mix(a.horizon, b.horizon, t),
        water: mix(a.water, b.water, t),
        sun: mix(a.sun, b.sun, t),
        night: a.night + (b.night - a.night) * t,
      };
    }
  }
  return KEYFRAMES[0]![1];
}
