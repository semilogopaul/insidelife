import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, hkdfSync } from 'node:crypto';
import {
  BETTING_APP_NAME,
  BETTING_CLUBS,
  BETTING_LEAGUE_NAME,
  LEAGUE_CLOCK,
  ODDS_SCALE,
  createRng,
  goalElapsed,
  lastKickedOffRound,
  leagueKickoff,
  leagueRound,
  leagueWeek,
  matchIdOf,
  openLeagueRound,
  parseMatchId,
  type BetFixtureDto,
  type BetRoundDto,
  type BetSelectionId,
  type BettingClubDto,
  type BettingLeagueDto,
  type FormResult,
  type GameMinute,
  type LeagueTableDto,
  type LeagueTableRowDto,
  type PlayedMatchDto,
  type Rng,
  type RoundResultsDto,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../config/configuration.js';
import { WorldService } from '../world/world.service.js';
import {
  drawMatch,
  expectedGoals,
  priceSelections,
  roundRobin,
  seasonStrength,
  type DrawnMatch,
} from './rules/league-model.js';

/** One match of the league, with its result (never sent before kickoff). */
export interface LeagueMatch {
  readonly matchId: string;
  readonly round: number;
  readonly index: number;
  readonly homeId: string;
  readonly awayId: string;
  readonly kickoffAt: GameMinute;
  readonly fullTimeAt: GameMinute;
  /** House odds in hundredths (null = off the board). */
  readonly odds: Readonly<Record<BetSelectionId, number | null>>;
  readonly result: DrawnMatch;
}

interface SeasonData {
  readonly strengths: ReadonlyMap<string, number>;
  /** weeks[week][index] */
  readonly weeks: ReadonlyArray<readonly LeagueMatch[]>;
}

/** Seasons kept in memory (each is 240 matches: tiny). Two are in play around a season boundary. */
const SEASON_CACHE = 4;

/**
 * The Lagos League. Everything — each season's strengths, the fixture list, every result and goal minute — is a pure
 * function of a **server-only secret** (`BETTING_SECRET`) and the season, week and match number, so every node agrees
 * and a restart changes nothing. The world seed is public (`/world/clock`), so it is never an input: nobody can
 * compute a result before the server reveals it at kickoff. Labels go through HMAC-SHA256 under the secret; knowing
 * one match's result (or even its 32-bit RNG seed) says nothing about any other match.
 *
 * Locally, without BETTING_SECRET, the secret is derived from JWT_ACCESS_SECRET with HKDF (the live site refuses to
 * boot without its own).
 */
@Injectable()
export class LeagueService {
  private readonly logger = new Logger(LeagueService.name);
  private readonly secret: Buffer;
  private readonly seasons = new Map<number, SeasonData>();
  private readonly clubs: readonly BettingClubDto[] = BETTING_CLUBS.map(
    ({ id, name, code, colors, home }) => ({ id, name, code, colors, home }),
  );

  constructor(
    private readonly world: WorldService,
    config: ConfigService<AppConfig, true>,
  ) {
    const betting = config.get('betting', { infer: true });
    if (betting.secret) {
      this.secret = Buffer.from(betting.secret, 'utf8');
    } else {
      const jwt = config.get('auth', { infer: true }).accessSecret;
      this.secret = Buffer.from(hkdfSync('sha256', jwt, 'insidelife', 'insidelife:betting-results:v1', 32));
      this.logger.log('BETTING_SECRET not set; derived the league secret from JWT_ACCESS_SECRET (HKDF)');
    }
  }

  now(): GameMinute {
    return this.world.now();
  }

  /** A match by id, with its result. Callers must not reveal the result before kickoff. */
  match(matchId: string): LeagueMatch {
    const parsed = parseMatchId(matchId);
    if (!parsed) throw new ResourceNotFoundException('Match');
    const { season, week } = leagueWeek(parsed.round);
    const match = this.season(season).weeks[week]?.[parsed.index];
    if (!match) throw new ResourceNotFoundException('Match');
    return match;
  }

  /** The board: the weeks open for betting (odds only) and the week live or just finished (results from kickoff). */
  board(now: GameMinute = this.now()): BettingLeagueDto {
    const open = openLeagueRound(now);
    const live = lastKickedOffRound(now);
    const liveMatches = this.roundMatches(live);
    return {
      appName: BETTING_APP_NAME,
      leagueName: BETTING_LEAGUE_NAME,
      now,
      clubs: this.clubs,
      upcoming: Array.from({ length: LEAGUE_CLOCK.openWeeks }, (_, offset) => open + offset).map((round) => ({
        ...this.roundInfo(round),
        fixtures: this.roundMatches(round).map((match) => this.fixture(match)),
      })),
      live: {
        ...this.roundInfo(live),
        fullTimeAt: leagueKickoff(live) + LEAGUE_CLOCK.fullTimeAt,
        matches: liveMatches.map((match) => this.played(match)),
      },
    };
  }

  /** This season's table after every week that has reached full time. */
  table(now: GameMinute = this.now()): LeagueTableDto {
    const current = Math.max(0, lastKickedOffRound(now));
    // The week on the board counts once it's over; before that the table stands after the previous week.
    const finished = leagueKickoff(current) + LEAGUE_CLOCK.fullTimeAt <= now ? current : current - 1;
    const { season } = leagueWeek(current);
    const data = this.season(season);
    const weeksPlayed = Math.max(
      0,
      Math.min(LEAGUE_CLOCK.weeksPerSeason, finished - leagueRound(season, 0) + 1),
    );
    const rows = new Map<
      string,
      {
        played: number;
        won: number;
        drawn: number;
        lost: number;
        goalsFor: number;
        goalsAgainst: number;
        form: FormResult[];
      }
    >();
    for (const club of BETTING_CLUBS)
      rows.set(club.id, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, form: [] });
    for (let week = 0; week < weeksPlayed; week++) {
      for (const match of data.weeks[week] ?? []) {
        const home = rows.get(match.homeId);
        const away = rows.get(match.awayId);
        if (!home || !away) continue;
        const { home: hg, away: ag } = match.result;
        home.played++;
        away.played++;
        home.goalsFor += hg;
        home.goalsAgainst += ag;
        away.goalsFor += ag;
        away.goalsAgainst += hg;
        if (hg > ag) {
          home.won++;
          away.lost++;
          home.form.push('W');
          away.form.push('L');
        } else if (hg < ag) {
          away.won++;
          home.lost++;
          away.form.push('W');
          home.form.push('L');
        } else {
          home.drawn++;
          away.drawn++;
          home.form.push('D');
          away.form.push('D');
        }
      }
    }
    const sorted: LeagueTableRowDto[] = [...rows.entries()]
      .map(([clubId, row]) => ({
        position: 0,
        clubId,
        ...row,
        points: row.won * 3 + row.drawn,
        form: row.form.slice(-5),
      }))
      .toSorted(
        (a, b) =>
          b.points - a.points ||
          b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
          b.goalsFor - a.goalsFor ||
          a.clubId.localeCompare(b.clubId),
      )
      .map((row, index) => ({ ...row, position: index + 1 }));
    return { season, weeksPlayed, rows: sorted };
  }

  /** One week's results (any round that has kicked off; default the latest). */
  results(round: number | undefined, now: GameMinute = this.now()): RoundResultsDto {
    const latest = lastKickedOffRound(now);
    const chosen = round ?? latest;
    if (chosen > latest) throw new GameRuleException('NOT_PLAYED_YET', 'That week hasn’t kicked off yet.');
    if (chosen < 0) throw new ResourceNotFoundException('Week');
    // Keep the archive to the current and the previous season.
    const earliest = Math.max(0, leagueRound(leagueWeek(latest).season - 1, 0));
    if (chosen < earliest) throw new ResourceNotFoundException('Week');
    return {
      ...this.roundInfo(chosen),
      fullTimeAt: leagueKickoff(chosen) + LEAGUE_CLOCK.fullTimeAt,
      matches: this.roundMatches(chosen).map((match) => this.played(match)),
      previous: chosen > earliest ? chosen - 1 : null,
      next: chosen < latest ? chosen + 1 : null,
    };
  }

  /** Strength of each club this season (published implicitly through the odds; used by tests and the model). */
  strengths(season: number): ReadonlyMap<string, number> {
    return this.season(season).strengths;
  }

  roundMatches(round: number): readonly LeagueMatch[] {
    const { season, week } = leagueWeek(round);
    return this.season(season).weeks[week] ?? [];
  }

  // ----- helpers ---------------------------------------------------------------------------------------------------

  private roundInfo(round: number): BetRoundDto {
    const { season, week } = leagueWeek(round);
    return { round, season, week, kickoffAt: leagueKickoff(round) };
  }

  private fixture(match: LeagueMatch): BetFixtureDto {
    const odds = Object.fromEntries(
      Object.entries(match.odds).map(([id, value]) => [id, value === null ? null : value / ODDS_SCALE]),
    ) as Record<BetSelectionId, number | null>;
    return {
      matchId: match.matchId,
      homeId: match.homeId,
      awayId: match.awayId,
      kickoffAt: match.kickoffAt,
      odds,
    };
  }

  /** The whole timeline of a match that has kicked off. Only ever called for kicked-off rounds. */
  private played(match: LeagueMatch): PlayedMatchDto {
    return {
      matchId: match.matchId,
      homeId: match.homeId,
      awayId: match.awayId,
      kickoffAt: match.kickoffAt,
      fullTimeAt: match.fullTimeAt,
      goals: match.result.goals.map((goal) => ({
        side: goal.side,
        minute: goal.minute,
        at: goalElapsed(goal.minute),
      })),
      home: match.result.home,
      away: match.result.away,
    };
  }

  /** Deterministic randomness under the secret: HMAC-SHA256(secret, label) → a 32-bit seed. */
  private rng(label: string): Rng {
    return createRng(createHmac('sha256', this.secret).update(label).digest().readUInt32BE(0));
  }

  private shock(season: number, clubId: string): number {
    return this.rng(`strength:${season}:${clubId}`).normal();
  }

  private season(season: number): SeasonData {
    const cached = this.seasons.get(season);
    if (cached) {
      // Refresh its place in the LRU.
      this.seasons.delete(season);
      this.seasons.set(season, cached);
      return cached;
    }
    const strengths = new Map(
      BETTING_CLUBS.map((club) => [
        club.id,
        seasonStrength(club.base, this.shock(season, club.id), this.shock(season - 1, club.id)),
      ]),
    );
    const order = this.rng(`fixtures:${season}`).shuffle(BETTING_CLUBS.map((club) => club.id));
    const weeks = roundRobin(order).map((pairs, week) =>
      pairs.map(([homeId, awayId], index): LeagueMatch => {
        const round = leagueRound(season, week);
        const expectation = expectedGoals(strengths.get(homeId) ?? 0, strengths.get(awayId) ?? 0);
        const kickoffAt = leagueKickoff(round);
        return {
          matchId: matchIdOf(round, index),
          round,
          index,
          homeId,
          awayId,
          kickoffAt,
          fullTimeAt: kickoffAt + LEAGUE_CLOCK.fullTimeAt,
          odds: priceSelections(expectation),
          result: drawMatch(expectation, this.rng(`match:${season}:${week}:${index}`)),
        };
      }),
    );
    const data: SeasonData = { strengths, weeks };
    this.seasons.set(season, data);
    while (this.seasons.size > SEASON_CACHE) {
      const oldest = this.seasons.keys().next().value;
      if (oldest === undefined) break;
      this.seasons.delete(oldest);
    }
    return data;
  }
}
