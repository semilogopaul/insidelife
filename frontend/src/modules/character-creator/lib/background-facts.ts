import { BACKGROUNDS, DISTRICTS, formatNaira, type BackgroundDefinition, type BackgroundId, type DistrictId } from '@insidelife/shared';

export interface BackgroundFact {
  readonly label: string;
  readonly value: string;
}

/** Card palette per background (Tailwind token classes). */
export const BACKGROUND_TONE: Readonly<Record<BackgroundId, { readonly card: string; readonly ink: string; readonly chip: string }>> = {
  'sapa-pikin': { card: 'bg-okada', ink: 'text-white', chip: 'bg-white/15 text-white' },
  'working-class': { card: 'bg-cobalt', ink: 'text-white', chip: 'bg-white/15 text-white' },
  ajebota: { card: 'bg-naira', ink: 'text-white', chip: 'bg-white/15 text-white' },
  'nepo-baby': { card: 'bg-danfo', ink: 'text-ink', chip: 'bg-ink/10 text-ink' },
};

function districtNames(ids: readonly string[]): string {
  const names = ids.map((id) => DISTRICTS[id as DistrictId]?.name ?? id);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** What a background means in practice: money, home, and the perk (or wahala) it comes with. */
export function backgroundFacts(background: BackgroundDefinition): BackgroundFact[] {
  const facts: BackgroundFact[] = [
    { label: 'Starting cash', value: formatNaira(background.startingCash) },
    { label: 'Pocket money', value: background.allowance > 0 ? `${formatNaira(background.allowance)} a month` : 'None. Na you go provide.' },
    { label: 'You grow up in', value: districtNames(background.homeDistrict) },
  ];
  facts.push({ label: 'The perk', value: backgroundPerk(background) });
  return facts;
}

export function backgroundPerk(background: BackgroundDefinition): string {
  if (background.startsWithCar) return 'A car in the compound from day one';
  if (background.sponsorsFees === 'private') return 'Daddy pays private university fees';
  if (background.sponsorsFees === 'public') return 'Your parents cover public university fees';
  if (background.hustleGain > 1.15) return `Street smart: hustle skills grow ${Math.round((background.hustleGain - 1) * 100)}% faster`;
  if (background.hustleGain > 1) return `Grind runs in the family: hustle skills grow ${Math.round((background.hustleGain - 1) * 100)}% faster`;
  return 'Connections everywhere';
}

/** Order the lottery cards are laid out in (rarest last, for drama). */
export const LOTTERY_ORDER: readonly BackgroundId[] = (Object.keys(BACKGROUNDS) as BackgroundId[]).sort((a, b) => BACKGROUNDS[b].weight - BACKGROUNDS[a].weight);
