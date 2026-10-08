import type { ActionDefinition, SkillKey, Skills } from '@insidelife/shared';

export interface RequirementSubject {
  readonly age: number;
  readonly skills: Skills;
  /** Tags of items the character owns (`laptop`, `tv`, `car`…). */
  readonly itemTags: readonly string[];
}

export interface UnmetRequirement {
  readonly code: 'TOO_YOUNG' | 'MISSING_ITEM' | 'SKILL_TOO_LOW';
  readonly message: string;
}

/** First requirement of an action the character doesn't meet, or null. Shared by player actions and habits. */
export function unmetRequirement(action: ActionDefinition, subject: RequirementSubject): UnmetRequirement | null {
  const requires = action.requires;
  if (!requires) return null;
  if (requires.minAge !== undefined && subject.age < requires.minAge) {
    return { code: 'TOO_YOUNG', message: `You must be ${requires.minAge}+ for that` };
  }
  if (requires.itemTag && !subject.itemTags.includes(requires.itemTag)) {
    return { code: 'MISSING_ITEM', message: `You need a ${requires.itemTag} for that — check the shops` };
  }
  for (const [skill, minimum] of Object.entries(requires.minSkill ?? {}) as Array<[SkillKey, number]>) {
    if (subject.skills[skill] < minimum) return { code: 'SKILL_TOO_LOW', message: `Your ${skill} skill needs to be at least ${minimum}` };
  }
  return null;
}
