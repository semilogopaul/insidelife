/**
 * Progression API contracts — owned by the progression domain: Life Goals, achievements, milestone moments, the
 * daily welcome and HUD suggestions.
 */
import type { AchievementCategory, AchievementRarity, CelebrationLevel } from '../catalog/progression.js';
import type { TransportMode } from '../catalog/transport.js';
import type { VenueType } from '../catalog/venues.js';
import type { GameMinute } from '../time/calendar.js';

export type LifeGoalStatus = 'locked' | 'active' | 'completed';

/** How to render a progress value: `naira` → ₦, `step` → a single tick (0/1). */
export type ProgressUnit = 'count' | 'naira' | 'points' | 'score' | 'years' | 'step';

export interface GoalProgressDto {
  readonly current: number;
  readonly target: number;
  readonly unit: ProgressUnit;
}

export interface LifeGoalRewardDto {
  readonly cash: number;
  readonly clout: number;
  /** Item label, when the goal gives an item. */
  readonly item: string | null;
  readonly bonus: { readonly label: string; readonly cash: number; readonly clout: number } | null;
}

export interface LifeGoalPathDto {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly targetVenueTypes: readonly VenueType[];
  readonly met: boolean;
}

export interface LifeGoalDto {
  readonly id: string;
  readonly chapter: number;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  readonly hint: string;
  readonly status: LifeGoalStatus;
  readonly optional: boolean;
  /** Venue types the client can offer GPS to (union of the goal's and its open paths'). */
  readonly targetVenueTypes: readonly VenueType[];
  /** One-tap action shortcut when the player is at a matching venue. */
  readonly suggestedActionId: string | null;
  /** Branching goals list their alternatives ("Register for JAMB — or take a job"). */
  readonly paths: readonly LifeGoalPathDto[];
  readonly completedPathId: string | null;
  /** Null when completed, locked or not measurable. */
  readonly progress: GoalProgressDto | null;
  readonly reward: LifeGoalRewardDto;
  readonly celebration: CelebrationLevel;
  readonly completedAt: GameMinute | null;
  /** What was actually paid out on completion (bonus included). */
  readonly granted: { readonly cash: number; readonly clout: number } | null;
}

export interface LifeChapterDto {
  readonly number: number;
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  readonly completedGoals: number;
  readonly totalGoals: number;
  /** Non-optional goals still standing between the player and the next chapter. */
  readonly requiredRemaining: number;
  readonly complete: boolean;
  readonly unlocked: boolean;
}

export interface NextChapterPreviewDto {
  readonly number: number;
  readonly title: string;
  readonly tagline: string;
  readonly goals: ReadonlyArray<{ readonly id: string; readonly title: string; readonly optional: boolean }>;
}

export interface AchievementDto {
  readonly id: string;
  /** "???" for a locked secret achievement. */
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly rarity: AchievementRarity;
  readonly rarityLabel: string;
  readonly category: AchievementCategory;
  readonly secret: boolean;
  readonly unlocked: boolean;
  readonly unlockedAt: GameMinute | null;
  /** Share of all players who have it (0-100, one decimal). */
  readonly rarityPercent: number;
  readonly clout: number;
  /** Progress toward a locked, non-secret achievement (null when unlocked, secret or not measurable). */
  readonly progress: GoalProgressDto | null;
}

export interface AchievementSummaryDto {
  readonly unlocked: number;
  readonly total: number;
  /** Most recent unlocks first (up to 3). */
  readonly recent: readonly AchievementDto[];
}

export interface AchievementsOverviewDto {
  readonly unlocked: number;
  readonly total: number;
  /** Characters the rarity percentages are computed over. */
  readonly population: number;
  readonly achievements: readonly AchievementDto[];
}

export interface DailyWelcomeStatusDto {
  readonly claimedToday: boolean;
  /** Africa/Lagos calendar date, YYYY-MM-DD. */
  readonly realDate: string;
  /** ISO time of the next Lagos midnight (when a new welcome becomes available). */
  readonly nextResetAt: string;
}

export interface ProgressionOverviewDto {
  readonly chapter: LifeChapterDto;
  readonly chapters: readonly LifeChapterDto[];
  /** Active goals across chapters (current chapter first, then leftover optional goals), in display order. */
  readonly activeGoals: readonly LifeGoalDto[];
  readonly completedGoals: readonly LifeGoalDto[];
  readonly nextChapter: NextChapterPreviewDto | null;
  readonly legacyComplete: boolean;
  readonly achievements: AchievementSummaryDto;
  readonly pendingMilestones: number;
  readonly dailyWelcome: DailyWelcomeStatusDto;
  /** Permanent clout from goals and badges (included in the character's status) and its cap. */
  readonly clout: { readonly earned: number; readonly cap: number };
}

export interface MilestoneStatDto {
  readonly label: string;
  readonly value: string;
}

/** A full-screen celebration the client shows once, then acknowledges. */
export interface MilestoneMomentDto {
  readonly id: string;
  readonly momentId: string;
  readonly title: string;
  readonly body: string;
  readonly icon: string;
  readonly shareText: string;
  readonly stats: readonly MilestoneStatDto[];
  readonly gameMinute: GameMinute;
  readonly createdAt: string;
}

export interface MilestoneAcknowledgementDto {
  readonly id: string;
  readonly acknowledgedAt: string;
  /** Pending moments left to show. */
  readonly remaining: number;
}

export interface DailyWelcomeFlavourDto {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly emoji: string;
  readonly icon: string;
}

export interface DailyWelcomeResultDto {
  /** `granted` the first time today; `already-claimed` afterwards (shows what today's welcome gave). */
  readonly status: 'granted' | 'already-claimed';
  readonly realDate: string;
  readonly nextResetAt: string;
  readonly flavour: DailyWelcomeFlavourDto;
  /** Naira received (unearned income). */
  readonly cash: number;
  /** Mood modifier applied (null when already claimed). */
  readonly mood: { readonly label: string; readonly value: number; readonly until: GameMinute } | null;
}

export type SuggestionKind = 'schedule' | 'need' | 'goal';

export interface SuggestionTargetDto {
  /** Venue id or `home:<characterId>`. */
  readonly locationId: string;
  readonly name: string;
  readonly venueType: VenueType | 'home';
  readonly mode: TransportMode;
  readonly etaMinutes: number;
  readonly fare: number;
  readonly openNow: boolean;
}

/** A "smart next step" for the HUD. */
export interface SuggestionDto {
  readonly id: string;
  readonly kind: SuggestionKind;
  /** 0-100, higher first. */
  readonly priority: number;
  readonly title: string;
  readonly body: string;
  /** lucide icon name. */
  readonly icon: string;
  /** Action to offer once there (or right now when `target` is null). */
  readonly actionId: string | null;
  readonly target: SuggestionTargetDto | null;
  readonly goalId: string | null;
  /** For `schedule` suggestions: the work shift or lecture block it's about. */
  readonly schedule?: { readonly kind: 'work' | 'lecture'; readonly startsAt: GameMinute };
}
