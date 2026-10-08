/**
 * Small, dependency-free colour helpers working on `#rrggbb` strings (sRGB). Pure — safe to unit test and to run
 * outside a WebGL context (canvas painters, cache keys).
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function parseHex(input: string): Rgb {
  const match = HEX.exec(input.trim());
  if (!match) return { r: 128, g: 128, b: 128 };
  let hex = match[1]!;
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const value = Number.parseInt(hex, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Normalise any accepted hex to lowercase `#rrggbb` (stable cache keys). */
export function normalizeHex(input: string): string {
  return toHex(parseHex(input));
}

export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

export function shadeHex(input: string, amount: number): string {
  return amount >= 0 ? mixHex(input, '#ffffff', amount) : mixHex(input, '#000000', -amount);
}

/** Relative luminance (0-1) of an sRGB colour. */
export function luminance(input: string): number {
  const { r, g, b } = parseHex(input);
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** Rotate hue by `degrees`, optionally nudging saturation/lightness. */
export function shiftHue(input: string, degrees: number, saturation = 0, lightness = 0): string {
  const hsl = toHsl(parseHex(input));
  return toHex(fromHsl(hsl.h + degrees, Math.min(1, Math.max(0, hsl.s + saturation)), Math.min(1, Math.max(0, hsl.l + lightness))));
}

/** A third colour that harmonises with two given ones (used as the accent in wax prints). */
export function accentFor(primary: string, secondary: string): string {
  const lp = luminance(primary);
  const ls = luminance(secondary);
  // Wax prints love a cream or a bright warm third tone; pick whichever contrasts with both.
  if (lp < 0.25 && ls < 0.25) return '#f3e6c4';
  if (lp > 0.6 && ls > 0.6) return shiftHue(primary, 180, 0.1, -0.35);
  return shiftHue(mixHex(primary, secondary, 0.5), 150, 0.15, 0.08);
}
