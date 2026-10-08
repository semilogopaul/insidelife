import {
  BODY_TYPES,
  EYE_STYLES,
  SKILL_KEYS,
  SKIN_TONES,
  type Appearance,
  type BackgroundId,
  type Gender,
  type HairStyle,
  type Rng,
  type SkillKey,
  type Skills,
} from '@insidelife/shared';

/** The heir takes over at this age at the youngest (raised by family until then). */
export const HEIR_AGE = 17;

const HAIR_BY_GENDER: Readonly<Record<Gender, readonly HairStyle[]>> = {
  male: ['lowcut', 'fade', 'afro', 'twists', 'locs', 'cornrows', 'bald'],
  female: ['braids', 'cornrows', 'bone-straight', 'bun', 'puff', 'afro', 'twists', 'locs'],
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** The heir looks like their parent, give or take: skin a shade either way, height ±4%, their own hair. */
export function heirAppearance(rng: Rng, parent: Appearance, gender: Gender): Appearance {
  return {
    bodyType: rng.chance(0.6) ? parent.bodyType : rng.pick(BODY_TYPES),
    height: Math.round(clamp(parent.height + rng.float(-0.04, 0.04), 0.92, 1.08) * 100) / 100,
    skinTone: clamp(parent.skinTone + rng.int(-1, 1), 0, SKIN_TONES.length - 1),
    hairStyle: rng.pick(HAIR_BY_GENDER[gender]),
    hairColor: rng.chance(0.85) ? rng.int(0, 1) : parent.hairColor,
    facialHair: gender === 'male' ? rng.pick(['none', 'stubble'] as const) : 'none',
    eyeStyle: rng.chance(0.5) ? parent.eyeStyle : rng.pick(EYE_STYLES),
  };
}

/** Starting skills for an heir: like a new 17-year-old, with book sense from how well they did at school. */
export function heirSkills(rng: Rng, background: BackgroundId, schoolPerformance: number): Skills {
  const skills = Object.fromEntries(SKILL_KEYS.map((key) => [key, rng.int(2, 8)])) as Record<SkillKey, number>;
  skills.intellect = Math.round(clamp(schoolPerformance, 0, 1) * 40 + rng.int(0, 10));
  skills.fitness = rng.int(20, 45);
  if (background === 'sapa-pikin') skills.hustle = rng.int(10, 18);
  return skills;
}

/** Deterministic 24-hex-char seed for the heir's own rolls. */
export function heirSeed(rng: Rng): string {
  return Array.from({ length: 3 }, () => rng.int(0, 0xffffffff).toString(16).padStart(8, '0')).join('');
}
