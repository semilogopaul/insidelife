import type { AchievementRarity } from '@insidelife/shared';

/** Badge disc colours by rarity (unlocked). Rarity is also always written out in words. */
export const RARITY_DISC: Readonly<Record<AchievementRarity, string>> = {
  common: 'bg-ink-3 text-on-ink',
  uncommon: 'bg-naira text-white',
  rare: 'bg-cobalt text-white',
  epic: 'bg-ankara text-white',
  legendary: 'bg-danfo text-ink shadow-[0_0_0_4px_rgb(246_185_11/0.3)]',
};

export const RARITY_TEXT: Readonly<Record<AchievementRarity, string>> = {
  common: 'text-text-soft',
  uncommon: 'text-naira',
  rare: 'text-cobalt',
  epic: 'text-ankara',
  legendary: 'text-[#9a6c00]',
};
