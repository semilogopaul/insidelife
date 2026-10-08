import type { InteractionDefinition, InteractionRequest, VenueDefinition } from '@insidelife/shared';
import type { RelationshipEntity } from '../entities/relationship.entity.js';
import type { FamilyGraph, Identity } from './family-graph.js';

/** Everything an interaction handler needs about who, where and what was asked. */
export interface InteractionContext {
  readonly graph: FamilyGraph;
  readonly rel: RelationshipEntity;
  readonly identity: Identity;
  readonly definition: InteractionDefinition;
  readonly request: InteractionRequest;
  /** Where the character is now (null at home or on the street). */
  readonly venue: VenueDefinition | null;
  /** 1-based attempt number for this interaction type with this person (keys rolls and payments). */
  readonly attempt: number;
}

export interface InteractionOutcome {
  readonly success: boolean;
  readonly title: string;
  readonly body: string;
  readonly tone: 'good' | 'bad' | 'neutral';
  /** Negative when money was spent. */
  readonly moneyDelta: number;
  readonly proposalId?: string | null;
}
