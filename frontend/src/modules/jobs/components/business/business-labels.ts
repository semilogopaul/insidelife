import { SKILL_LABELS, type BusinessRisk, type BusinessTrait, type SkillKey } from '@insidelife/shared';

export const RISK_BADGE: Record<
  BusinessRisk,
  { readonly tone: 'good' | 'warn' | 'bad'; readonly label: string }
> = {
  low: { tone: 'good', label: 'Low risk' },
  medium: { tone: 'warn', label: 'Medium risk' },
  high: { tone: 'bad', label: 'High risk' },
  'very-high': { tone: 'bad', label: 'Very high risk' },
};

export function traitLabel(trait: BusinessTrait): string {
  return trait === 'connections' ? 'Connections' : SKILL_LABELS[trait as SkillKey];
}
