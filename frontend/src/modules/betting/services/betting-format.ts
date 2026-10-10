import { BET_SELECTIONS, matchClock, type BetSelectionId, type BettingClubDto, type MatchGoalDto, type PlayedMatchDto } from '@insidelife/shared';

/** Odds as printed on the board: always two decimals. */
export function formatOdds(odds: number | null): string {
  return odds === null ? '–' : odds.toFixed(2);
}

/** "2:05" from milliseconds (a countdown to kickoff); "0:00" once it's past. */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function clubName(clubs: ReadonlyMap<string, BettingClubDto>, id: string): string {
  return clubs.get(id)?.name ?? id;
}

/** What a selection means for this fixture, in words: "Enyimba to win", "Draw", "Over 2.5 goals". */
export function pickLabel(selection: BetSelectionId, home: string, away: string): string {
  switch (selection) {
    case '1x2:home':
      return `${home} to win`;
    case '1x2:away':
      return `${away} to win`;
    case 'dc:1x':
      return `${home} or draw`;
    case 'dc:x2':
      return `${away} or draw`;
    default:
      return BET_SELECTIONS[selection].label;
  }
}

export interface LiveState {
  readonly home: number;
  readonly away: number;
  readonly label: string;
  readonly phase: ReturnType<typeof matchClock>['phase'];
  /** Goals scored so far, in order. */
  readonly goals: readonly MatchGoalDto[];
}

/** The score and clock `elapsed` game minutes after kickoff (goals only count once their minute has come). */
export function liveState(match: PlayedMatchDto, elapsed: number): LiveState {
  const goals = match.goals.filter((goal) => goal.at <= elapsed);
  const clock = matchClock(elapsed);
  return {
    home: goals.filter((goal) => goal.side === 'home').length,
    away: goals.filter((goal) => goal.side === 'away').length,
    label: clock.label,
    phase: clock.phase,
    goals,
  };
}
