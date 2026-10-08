/** Family & relationships API contracts — owned by the family domain. */
import type { Gender } from '../catalog/appearance.js';
import type {
  ChildMilestoneId,
  ChildSchoolTier,
  FuneralTier,
  InteractionType,
  PersonTrait,
  RelationshipKind,
  RelationshipStatus,
  WealthTier,
} from '../catalog/family.js';
import type { Ethnicity } from '../catalog/life.js';
import type { GameMinute } from '../time/calendar.js';

/** One person in your life: an NPC or a real player. `id` is the relationship id (what interactions target). */
export interface PersonDto {
  readonly id: string;
  /** NPC id (null for real players). */
  readonly personId: string | null;
  /** Player character id when this person is a real player (or an NPC who became one — your heir). */
  readonly characterId: string | null;
  readonly handle: string | null;
  readonly isPlayer: boolean;
  readonly firstName: string;
  readonly lastName: string;
  readonly gender: Gender;
  readonly age: number;
  readonly alive: boolean;
  readonly deceasedAt: GameMinute | null;
  readonly ethnicity: Ethnicity | null;
  readonly traits: readonly PersonTrait[];
  readonly occupation: string | null;
  readonly wealth: WealthTier | null;
  readonly kind: RelationshipKind;
  /** 0-100, decays without contact. */
  readonly closeness: number;
  /** 0-100, decays without dates and attention. */
  readonly romance: number;
  readonly since: GameMinute;
  readonly lastContactAt: GameMinute;
  readonly metAt: { readonly id: string; readonly label: string } | null;
}

export interface RelationshipDto extends PersonDto {
  readonly datingSince: GameMinute | null;
  readonly engagedAt: GameMinute | null;
  readonly introductionDone: boolean;
  readonly traditionalWeddingDone: boolean;
  readonly whiteWeddingDone: boolean;
  /** NPC partner's due date when expecting. */
  readonly expectingAt: GameMinute | null;
  /** Interactions on cooldown: type → game minute when available again. */
  readonly cooldowns: Readonly<Partial<Record<InteractionType, GameMinute>>>;
}

export interface ChildDto extends PersonDto {
  readonly schoolTier: ChildSchoolTier;
  /** This term's fee at today's prices (0 when not in school). */
  readonly feePerTerm: number;
  /** Sent home for unpaid fees this term. */
  readonly sentHome: boolean;
  readonly milestones: readonly ChildMilestoneId[];
  readonly waecCredits: number | null;
  /** You pay this child's fees (the birthing parent for player couples). */
  readonly guardian: boolean;
}

export interface HouseholdDto {
  /** Multiplier this household applies to your daily living costs. */
  readonly livingCostMultiplier: number;
  readonly spouseWorking: boolean;
  readonly dependants: number;
  /** Nanny cost per month at today's prices (0 when not needed or someone stays home). */
  readonly childcarePerMonth: number;
  /** Total school fees due at the next term start. */
  readonly schoolFeesNextTerm: number;
  readonly nextTermStartsAt: GameMinute;
}

export interface FamilyTreeDto {
  readonly relationshipStatus: RelationshipStatus;
  readonly partner: RelationshipDto | null;
  readonly parents: readonly PersonDto[];
  readonly grandparents: readonly PersonDto[];
  readonly siblings: readonly PersonDto[];
  readonly children: readonly ChildDto[];
  readonly household: HouseholdDto;
  /** Who continues the dynasty if you die today. */
  readonly heir: { readonly personId: string; readonly name: string; readonly age: number } | null;
  readonly generation: number;
}

export interface InteractionRequest {
  readonly type: InteractionType;
  /** Gift value or ring value (₦). */
  readonly amount?: number;
  /** White wedding tier. */
  readonly tier?: string;
}

export interface InteractionResultDto {
  readonly success: boolean;
  readonly title: string;
  readonly body: string;
  readonly tone: 'good' | 'bad' | 'neutral';
  /** Net money change (negative = spent). */
  readonly moneyDelta: number;
  readonly relationship: RelationshipDto;
  /** For player targets: a proposal was sent instead of an instant result. */
  readonly proposalId: string | null;
}

export const PLAYER_PROPOSAL_KINDS = ['friend', 'date', 'marriage'] as const;
export type PlayerProposalKind = (typeof PLAYER_PROPOSAL_KINDS)[number];
/** Proposal kinds, including those created by interactions (trying for a baby needs consent too). */
export type ProposalKind = PlayerProposalKind | 'baby';
export type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface CreateProposalRequest {
  readonly kind: PlayerProposalKind;
  /** Engagement ring value for marriage proposals (₦150k - ₦5m). */
  readonly ringValue?: number;
  readonly message?: string;
}

export interface ProposalPartyDto {
  readonly characterId: string;
  readonly handle: string;
  readonly name: string;
}

export interface ProposalDto {
  readonly id: string;
  readonly kind: ProposalKind;
  readonly status: ProposalStatus;
  readonly from: ProposalPartyDto;
  readonly to: ProposalPartyDto;
  readonly message: string | null;
  readonly ringValue: number;
  readonly createdAt: GameMinute;
  readonly respondedAt: GameMinute | null;
}

export interface ProposalsDto {
  readonly incoming: readonly ProposalDto[];
  readonly outgoing: readonly ProposalDto[];
}

export interface UpdateChildRequest {
  readonly schoolTier: ChildSchoolTier;
}

export interface EstateDto {
  readonly gross: number;
  readonly funeral: number;
  readonly funeralTier: FuneralTier;
  readonly probate: number;
  readonly inherited: number;
}

/** One handover in a dynasty (for the epitaph screen and the dynasty history). */
export interface SuccessionDto {
  readonly id: string;
  readonly generation: number;
  readonly deceased: { readonly characterId: string; readonly name: string; readonly diedAt: GameMinute; readonly causeOfDeath: string | null };
  /** Null when there were no children: start a new life. */
  readonly heir: { readonly characterId: string; readonly name: string; readonly agedUp: boolean } | null;
  readonly estate: EstateDto;
  readonly createdAt: GameMinute;
}
