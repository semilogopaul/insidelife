import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

export interface FamilyMember {
  readonly id: string;
  readonly name: string;
  readonly relation: 'father' | 'mother' | 'sibling' | 'partner' | 'spouse' | 'child';
  readonly age: number;
  readonly alive: boolean;
  /** Player character id if the member is a real player. */
  readonly characterId: string | null;
}

export interface FamilySnapshot {
  readonly members: readonly FamilyMember[];
  readonly relationship: 'single' | 'dating' | 'engaged' | 'married' | 'widowed' | 'divorced';
  readonly partner: FamilyMember | null;
  readonly children: readonly FamilyMember[];
}

/** Implemented by the family module. */
export interface FamilyPort {
  snapshot(ctx: SimulationContext): Promise<FamilySnapshot>;
  /** Change closeness with a family member (black tax refused, gift sent). */
  adjustCloseness(ctx: SimulationContext, memberId: string, delta: number): Promise<void>;
  /** A baby is born to this character (health module calls this at the end of a pregnancy). */
  recordBirth(ctx: SimulationContext, partnerName: string): Promise<void>;
}

export const FAMILY_PORT = Symbol('FAMILY_PORT');
