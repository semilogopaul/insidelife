import type {
  BetLegRequest,
  BetQuoteDto,
  BetSlipsDto,
  BettingAccountDto,
  BettingLeagueDto,
  LeagueTableDto,
  PlaceBetResultDto,
  RoundResultsDto,
  SelfExclusionDays,
  UpdateBettingLimitsRequest,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

/** Betting endpoints (all under /api/v1/betting). Every price and return comes back from the server. */
export const bettingApi = {
  league: () => api.get<BettingLeagueDto>('/betting/league'),
  table: () => api.get<LeagueTableDto>('/betting/table'),
  results: (round: number | null) => api.get<RoundResultsDto>('/betting/results', { query: round === null ? {} : { round } }),
  account: () => api.get<BettingAccountDto>('/betting/me'),
  slips: () => api.get<BetSlipsDto>('/betting/slips'),
  quote: (legs: readonly BetLegRequest[], stake: number) => api.post<BetQuoteDto>('/betting/quotes', { legs, stake }),
  /** Tap once: a retry of the same slip reuses its key, so the stake is charged once. */
  place: (legs: readonly BetLegRequest[], stake: number) =>
    tapOnce(`bet:${legs.map((leg) => `${leg.matchId}:${leg.selection}`).join(',')}:${stake}`, (idempotencyKey) =>
      api.post<PlaceBetResultDto>('/betting/slips', { legs, stake, idempotencyKey }),
    ),
  limits: (request: UpdateBettingLimitsRequest) => api.put<BettingAccountDto>('/betting/me/limits', request),
  selfExclude: (days: SelfExclusionDays) => api.post<BettingAccountDto>('/betting/me/self-exclusions', { days }),
  confirmBirthDate: (birthDate: string) => api.put<BettingAccountDto>('/betting/me/birth-date', { birthDate }),
};
