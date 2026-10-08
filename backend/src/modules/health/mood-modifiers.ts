import type { MoodModifier } from '../characters/entities/character.entity.js';
import type { SimulationContext } from '../simulation/simulation-context.js';

/** Add or replace a mood modifier by id. */
export function setMoodModifier(ctx: SimulationContext, modifier: MoodModifier): void {
  const character = ctx.character;
  character.moodModifiers = [...character.moodModifiers.filter((existing) => existing.id !== modifier.id), modifier];
}

export function removeMoodModifier(ctx: SimulationContext, id: string): void {
  const character = ctx.character;
  if (!character.moodModifiers.some((existing) => existing.id === id)) return;
  character.moodModifiers = character.moodModifiers.filter((existing) => existing.id !== id);
}

/** Mood modifier ids for illness symptoms are namespaced so recovery removes exactly what illness added. */
export function illnessModifierId(conditionId: string): string {
  return `illness:${conditionId}`;
}
