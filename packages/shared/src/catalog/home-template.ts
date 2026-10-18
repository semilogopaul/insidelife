/**
 * Which home interior fits the home a character lives in. The 3D client draws this template and the server places
 * furniture in it, so both ask here (label keywords first, comfort as a fallback).
 */

export type HomeTemplateId = 'home-family' | 'home-face-me' | 'home-self-contain' | 'home-flat' | 'home-duplex' | 'home-mansion' | 'home-hostel';

export interface HomeTemplateInput {
  readonly label: string;
  readonly ownership: 'family' | 'rented' | 'owned' | 'hostel';
  readonly comfort: number;
}

export function homeTemplateIdFor(home: HomeTemplateInput | null | undefined): HomeTemplateId {
  if (!home) return 'home-family';
  if (home.ownership === 'hostel') return 'home-hostel';
  const label = home.label.toLowerCase();
  if (/face-me|face me/.test(label)) return 'home-face-me';
  if (/self[- ]contain/.test(label)) return 'home-self-contain';
  if (/mansion|banana island/.test(label)) return 'home-mansion';
  if (/duplex/.test(label)) return 'home-duplex';
  if (/family house/.test(label)) return 'home-family';
  if (/flat|bungalow|bed/.test(label)) return 'home-flat';
  if (home.comfort >= 12) return 'home-mansion';
  if (home.comfort >= 9) return 'home-duplex';
  if (home.comfort >= 5) return 'home-flat';
  if (home.comfort >= 3) return 'home-self-contain';
  return home.comfort <= 0 ? 'home-face-me' : 'home-family';
}
