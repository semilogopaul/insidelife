import type { Weather } from '@insidelife/shared';

/**
 * Pure sky/light model for Lagos (6.5°N: sunrise ≈ 6:40, sunset ≈ 18:50, sun high and slightly south).
 * Colours are authored in sRGB hex and blended between hour keyframes; weather bends the result
 * (harmattan haze, clouds, rain). The renderer converts to linear once per frame.
 */

export interface AtmosphereState {
  /** Unit vector pointing towards the key light (sun by day, moon by night). */
  readonly lightDirection: readonly [number, number, number];
  readonly lightColor: number;
  readonly lightIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly skyTop: number;
  readonly skyHorizon: number;
  /** Unit vector towards the sun even when it is below the horizon (sky glow). */
  readonly sunDirection: readonly [number, number, number];
  readonly sunColor: number;
  readonly fogColor: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly envIntensity: number;
  readonly exposure: number;
  /** 0 day … 1 full night (windows, street lights, signs). */
  readonly night: number;
  readonly stars: number;
  readonly cloud: number;
  readonly haze: number;
  readonly wet: number;
  readonly rain: number;
}

interface Keyframe {
  readonly hour: number;
  readonly top: number;
  readonly horizon: number;
  readonly sun: number;
  readonly sunIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly env: number;
  readonly exposure: number;
  readonly night: number;
}

const k = (
  hour: number,
  top: number,
  horizon: number,
  sun: number,
  sunIntensity: number,
  hemiSky: number,
  hemiGround: number,
  hemiIntensity: number,
  env: number,
  exposure: number,
  night: number,
): Keyframe => ({ hour, top, horizon, sun, sunIntensity, hemiSky, hemiGround, hemiIntensity, env, exposure, night });

// prettier-ignore
const KEYFRAMES: readonly Keyframe[] = [
  k(0.0,  0x081226, 0x1b2844, 0x9db4e6, 0.26, 0x2c3d63, 0x14100c, 0.4,  0.1,  1.12, 1),
  k(5.0,  0x0a1530, 0x22304e, 0x9db4e6, 0.26, 0x2c3d63, 0x14100c, 0.4,  0.1,  1.12, 1),
  k(5.9,  0x22386a, 0xc98a7c, 0xffb08a, 0.25, 0x6a7fae, 0x2a211a, 0.7,  0.22, 1.2,  0.75),
  k(6.7,  0x5a84c0, 0xf4b98a, 0xffb878, 1.4,  0xa9c3e4, 0x5a4532, 0.8,  0.35, 1.05, 0.25),
  k(8.5,  0x4b8bd0, 0xd3e3ea, 0xffecd2, 2.7,  0xbcd6ef, 0x7d6448, 0.85, 0.5,  0.95, 0),
  k(12.5, 0x3d84d4, 0xd8e7ee, 0xfff7ec, 3.1,  0xc4dcf2, 0x86704f, 0.9,  0.55, 0.92, 0),
  k(16.0, 0x4686cc, 0xe0e6e0, 0xffe6c2, 2.8,  0xbfd5ec, 0x86704f, 0.85, 0.5,  0.95, 0),
  k(17.6, 0x5f86c2, 0xf0c48e, 0xffb262, 2.3,  0xd6c6b4, 0x7a5a3a, 0.75, 0.42, 1.0,  0.05),
  k(18.45,0x3a5592, 0xe0a07c, 0xff7c45, 0.95, 0x9a8aa0, 0x4a3426, 0.7,  0.3,  1.1,  0.35),
  k(19.1, 0x1b2f62, 0x5b6c9c, 0xd98a7a, 0.25, 0x56679a, 0x24201c, 0.62, 0.2,  1.2,  0.8),
  k(20.2, 0x0a1530, 0x1f2c4b, 0x9db4e6, 0.26, 0x2c3d63, 0x14100c, 0.4,  0.1,  1.12, 1),
  k(24.0, 0x081226, 0x1b2844, 0x9db4e6, 0.26, 0x2c3d63, 0x14100c, 0.4,  0.1,  1.12, 1),
];

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Blend two sRGB hex colours. */
export function mixHex(a: number, b: number, t: number): number {
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
}

const SUNRISE = 6.35;
const SUNSET = 18.85;

function sunVector(hour: number): readonly [number, number, number] {
  const t = (hour - SUNRISE) / (SUNSET - SUNRISE);
  const angle = t * Math.PI;
  const elevation = Math.sin(angle) * 1.25;
  const x = Math.cos(angle);
  const y = elevation;
  const z = 0.32;
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

const MOON: readonly [number, number, number] = (() => {
  const v = [-0.35, 0.82, -0.45];
  const length = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return [(v[0] ?? 0) / length, (v[1] ?? 0) / length, (v[2] ?? 0) / length];
})();

export interface FogBudget {
  /** Clear-day fog far distance (draw distance) for the quality tier. */
  readonly far: number;
}

export function computeAtmosphere(hourOfDay: number, weather: Weather, budget: FogBudget): AtmosphereState {
  const hour = ((hourOfDay % 24) + 24) % 24;
  let index = 0;
  while (index < KEYFRAMES.length - 2 && (KEYFRAMES[index + 1] as Keyframe).hour <= hour) index++;
  const a = KEYFRAMES[index] as Keyframe;
  const b = KEYFRAMES[index + 1] as Keyframe;
  const t = smooth(clamp01((hour - a.hour) / (b.hour - a.hour)));

  let top = mixHex(a.top, b.top, t);
  let horizon = mixHex(a.horizon, b.horizon, t);
  let lightColor = mixHex(a.sun, b.sun, t);
  let lightIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
  let hemiSky = mixHex(a.hemiSky, b.hemiSky, t);
  const hemiGround = mixHex(a.hemiGround, b.hemiGround, t);
  let hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity, t);
  let envIntensity = lerp(a.env, b.env, t);
  const exposure = lerp(a.exposure, b.exposure, t);
  const night = lerp(a.night, b.night, t);

  const sun = sunVector(hour);
  const sunUp = sun[1] > 0.03;
  // Cross-fade the key light to the moon around the horizon so shadows never flip abruptly.
  const lightDirection = sunUp ? sun : MOON;
  if (!sunUp) lightColor = mixHex(lightColor, 0x9db4e6, 0.6);

  // Weather.
  const intensity = clamp01(weather.intensity);
  const cloud = weather.condition === 'cloudy' ? 0.35 + intensity * 0.5 : weather.raining ? 0.85 + intensity * 0.15 : weather.condition === 'haze' ? 0.15 : 0.12;
  const haze = weather.condition === 'haze' ? 0.45 + intensity * 0.55 : 0;
  const rain = weather.raining ? 0.45 + intensity * 0.55 : 0;
  const wet = weather.raining ? 1 : 0;
  let fogColor = horizon;
  let fogFar = budget.far;

  if (weather.condition === 'cloudy') {
    const grey = mixHex(0x9fabb4, 0x2a3242, night);
    top = mixHex(top, grey, 0.45 * cloud);
    horizon = mixHex(horizon, grey, 0.35 * cloud);
    lightIntensity *= 1 - 0.55 * cloud;
    hemiIntensity *= 1 + 0.25 * cloud;
    fogFar *= 0.92;
  }
  if (haze > 0) {
    const dust = mixHex(0xd9c29a, 0x3b3328, night);
    top = mixHex(top, mixHex(dust, top, 0.35), 0.55 * haze);
    horizon = mixHex(horizon, dust, 0.85 * haze);
    lightColor = mixHex(lightColor, 0xffc58a, 0.5 * haze);
    lightIntensity *= 1 - 0.45 * haze;
    hemiSky = mixHex(hemiSky, dust, 0.4 * haze);
    fogFar = lerp(fogFar, 170, haze);
  }
  if (rain > 0) {
    const storm = mixHex(0x66717c, 0x161c26, night);
    top = mixHex(top, mixHex(storm, 0x3b444f, 0.4), 0.85);
    horizon = mixHex(horizon, storm, 0.85);
    lightIntensity *= 0.22;
    hemiSky = mixHex(hemiSky, 0x8d99a4, 0.6 * (1 - night));
    hemiIntensity *= 1.1;
    envIntensity *= 0.8;
    fogFar = lerp(fogFar, 190, rain);
  }
  // Fog a touch towards the zenith colour keeps distant blocks from turning into a flat sunset wash.
  fogColor = mixHex(horizon, top, 0.25);

  return {
    lightDirection,
    lightColor,
    lightIntensity,
    hemiSky,
    hemiGround,
    hemiIntensity,
    skyTop: top,
    skyHorizon: horizon,
    sunDirection: sun,
    sunColor: mixHex(a.sun, b.sun, t),
    fogColor,
    fogNear: Math.max(25, fogFar * (haze > 0.05 ? 0.12 : rain > 0 ? 0.2 : 0.45)),
    fogFar,
    envIntensity,
    exposure,
    night,
    stars: clamp01((night - 0.6) / 0.4) * (1 - cloud),
    cloud,
    haze,
    wet,
    rain,
  };
}
