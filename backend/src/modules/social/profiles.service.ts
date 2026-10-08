import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import {
  findVenue,
  isHomeLocation,
  selfMadeNetWorthOf,
  wealthBandLabel,
  yearsBetween,
  type Appearance,
  type Gender,
  type Outfit,
  type PlayerCardDto,
  type PlayerProfileDto,
  type PlayerRelationship,
  type PlayerSearchResultDto,
  type SocialPrivacyDto,
  type UpdateSocialPrivacyRequest,
  type VenuePlayerDto,
  type VenuePlayersDto,
} from '@insidelife/shared';
import { CREDENTIALS_PORT, type CredentialsPort } from '../../common/ports/credentials.port.js';
import { EMPLOYMENT_PORT, type EmploymentPort } from '../../common/ports/employment.port.js';
import { FAMILY_PORT, type FamilyPort } from '../../common/ports/family.port.js';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import { PresenceService } from '../presence/presence.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import { WorldService } from '../world/world.service.js';
import { PartyEntity } from './entities/party.entity.js';
import { SocialProfileEntity } from './entities/social-profile.entity.js';
import { FriendsService } from './friends.service.js';
import { CARD_COLUMNS, PlayerCardsService, type CardRow } from './player-cards.service.js';
import { computeBadges, degreeSummary, friendlyLocationLabel, headlineBadges, profileTitle, statusTierDto } from './rules/profile.rules.js';
import { SocialGuard } from './social-guard.service.js';
import { playerNotFound } from './social-errors.js';

/** Refresh-on-settle runs at most once per this many game minutes (≈ 30 real seconds). */
export const PROFILE_REFRESH_INTERVAL = 60;
const SEARCH_LIMIT = 20;
const VENUE_LIST_LIMIT = 40;
/** A party with at least this many guests earns the "Owambe host" badge. */
const HOSTED_PARTY_MIN_GUESTS = 5;

/** Columns a refresh may overwrite. Privacy settings are deliberately absent. */
const REFRESHED_COLUMNS = [
  'title',
  'badges',
  'degree_label',
  'best_cgpa',
  'children_count',
  'married',
  'monthly_income',
  'self_made_net_worth',
  'friend_count',
  'parties_hosted',
  'refreshed_at_game',
  'updated_at',
];

interface VenuePlayerRow extends CardRow {
  readonly gender: Gender;
  readonly appearance: Appearance;
  readonly outfit: Outfit;
  readonly activity: { readonly actionId?: string } | null;
  readonly total: string;
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (match) => `\\${match}`);

/**
 * Public profiles: the profile cache (refreshed from the employment, credentials and family ports), privacy settings,
 * player search, the rich profile page and "who's here" at a venue.
 */
@Injectable()
export class ProfilesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMPLOYMENT_PORT) private readonly employment: EmploymentPort,
    @Inject(CREDENTIALS_PORT) private readonly credentials: CredentialsPort,
    @Inject(FAMILY_PORT) private readonly family: FamilyPort,
    private readonly planner: TimelinePlanner,
    private readonly directory: CharacterDirectory,
    private readonly presence: PresenceService,
    private readonly world: WorldService,
    private readonly cards: PlayerCardsService,
    private readonly friends: FriendsService,
    private readonly guard: SocialGuard,
  ) {}

  // ----- Cache --------------------------------------------------------------------------------------------------

  /** The cached row, memoised for the rest of the session. */
  cached(ctx: SimulationContext): Promise<SocialProfileEntity | null> {
    return ctx.memo('social:profile', () => ctx.manager.findOne(SocialProfileEntity, { where: { characterId: ctx.character.id } }));
  }

  isStale(profile: SocialProfileEntity | null, now: number): boolean {
    return !profile || now - profile.refreshedAtGame >= PROFILE_REFRESH_INTERVAL;
  }

  /** Rebuild the public profile cache from the ports and character (cheap upsert inside the session). */
  async refresh(ctx: SimulationContext): Promise<void> {
    const character = ctx.character;
    const job = await this.employment.current(ctx);
    const monthlyIncome = Math.max(0, Math.round(await this.employment.monthlyIncome(ctx)));
    const credentials = await this.credentials.credentials(ctx);
    const family = await this.family.snapshot(ctx);
    const campusName = credentials.enrolled ? await this.currentCampus(ctx) : null;
    const [friendCount, partiesHosted] = await Promise.all([
      this.friends.friendCount(character.id, ctx.manager),
      ctx.manager
        .createQueryBuilder(PartyEntity, 'party')
        .where('party.host_id = :id AND party.status = :status AND party.guest_count >= :min', { id: character.id, status: 'ended', min: HOSTED_PARTY_MIN_GUESTS })
        .getCount(),
    ]);
    const selfMadeNetWorth = selfMadeNetWorthOf(character.netWorth, character.unearnedTotal);
    const degree = degreeSummary(credentials.degrees);
    const badges = computeBadges({ job, credentials, family, campusName, selfMadeNetWorth, generation: character.generation, friendCount, partiesHosted });

    await ctx.manager
      .createQueryBuilder()
      .insert()
      .into(SocialProfileEntity)
      .values({
        characterId: character.id,
        title: profileTitle({ job, credentials, campusName }),
        badges,
        degreeLabel: degree.label,
        bestCgpa: degree.bestCgpa,
        childrenCount: family.children.length,
        married: family.relationship === 'married',
        monthlyIncome,
        selfMadeNetWorth,
        friendCount,
        partiesHosted,
        refreshedAtGame: ctx.time,
      })
      .orUpdate(REFRESHED_COLUMNS, ['character_id'])
      .execute();
    ctx.invalidate('social:profile');
  }

  /** Campus of today's lectures (the credentials port doesn't name the current institution). */
  private async currentCampus(ctx: SimulationContext): Promise<string | null> {
    const blocks = await this.planner.blocksAround(ctx, ctx.time);
    const lecture = blocks.find((block) => block.kind === 'lecture');
    return lecture ? (findVenue(lecture.locationId)?.name ?? null) : null;
  }

  // ----- Privacy ------------------------------------------------------------------------------------------------

  async privacy(characterId: string): Promise<SocialPrivacyDto> {
    const row = await this.dataSource.getRepository(SocialProfileEntity).findOne({ where: { characterId } });
    return { showExactWealth: row?.showExactWealth ?? false, locationVisibility: row?.locationVisibility ?? 'friends' };
  }

  async updatePrivacy(ctx: SimulationContext, update: UpdateSocialPrivacyRequest): Promise<SocialPrivacyDto> {
    if (!(await this.cached(ctx))) await this.refresh(ctx);
    const patch: Partial<Pick<SocialProfileEntity, 'showExactWealth' | 'locationVisibility'>> = {};
    if (update.showExactWealth !== undefined) patch.showExactWealth = update.showExactWealth;
    if (update.locationVisibility !== undefined) patch.locationVisibility = update.locationVisibility;
    if (Object.keys(patch).length > 0) await ctx.manager.update(SocialProfileEntity, { characterId: ctx.character.id }, patch);
    const row = await ctx.manager.findOneByOrFail(SocialProfileEntity, { characterId: ctx.character.id });
    return { showExactWealth: row.showExactWealth, locationVisibility: row.locationVisibility };
  }

  // ----- Search & profile ---------------------------------------------------------------------------------------

  async search(viewerId: string, rawQuery: string): Promise<PlayerSearchResultDto> {
    const query = rawQuery.trim().replace(/^@/, '').toLowerCase();
    if (query.length < 2) return { items: [] };
    const like = escapeLike(query);
    const rows: CardRow[] = await this.dataSource.query(
      `SELECT ${CARD_COLUMNS}
         FROM characters c
    LEFT JOIN social_profiles p ON p.character_id = c.id
        WHERE c.alive AND c.id <> $1
          AND (c.handle LIKE $2 OR (c.first_name || ' ' || c.last_name) ILIKE $3)
          AND NOT EXISTS (
                SELECT 1 FROM social_blocks b
                 WHERE (b.blocker_id = $1 AND b.blocked_id = c.id) OR (b.blocker_id = c.id AND b.blocked_id = $1))
     ORDER BY (c.handle = $4) DESC, (c.handle LIKE $2) DESC, c.status DESC, c.handle
        LIMIT ${SEARCH_LIMIT}`,
      [viewerId, `${like}%`, `%${like}%`, query],
    );
    const online = await this.cards.onlineSet(rows.map((row) => row.id));
    return { items: rows.map((row) => this.cards.toCard(row, online.has(row.id))) };
  }

  async profile(viewer: CharacterEntity, handle: string): Promise<PlayerProfileDto> {
    const target = await this.directory.findByHandle(handle);
    if (!target || !target.alive) throw playerNotFound();
    const isSelf = target.id === viewer.id;
    const [blockedByYou, blockedYou] = isSelf
      ? [false, false]
      : await Promise.all([
          this.guard.hasBlocked(viewer.id, target.id),
          this.guard.hasBlocked(target.id, viewer.id),
        ]);
    // Someone who blocked you simply doesn't exist for you.
    if (blockedYou) throw playerNotFound();

    const [cached, pair, mutual, friendCount, online] = await Promise.all([
      this.dataSource.getRepository(SocialProfileEntity).findOne({ where: { characterId: target.id } }),
      isSelf ? Promise.resolve(null) : this.friends.pair(viewer.id, target.id),
      isSelf ? Promise.resolve({ count: 0, sample: [] as PlayerCardDto[] }) : this.friends.mutualFriends(viewer.id, target.id),
      this.friends.friendCount(target.id),
      this.presence.isOnline(target.id),
    ]);

    let relationship: PlayerRelationship = isSelf ? 'self' : 'none';
    if (pair?.status === 'accepted') relationship = 'friends';
    else if (pair?.status === 'pending') relationship = pair.requesterId === viewer.id ? 'request-sent' : 'request-received';

    const locationVisible = isSelf || (relationship === 'friends' && (cached?.locationVisibility ?? 'friends') === 'friends');
    const exactWealth = isSelf || (cached?.showExactWealth ?? false);
    const selfMade = selfMadeNetWorthOf(target.netWorth, target.unearnedTotal);
    const income = cached?.monthlyIncome ?? 0;

    return {
      id: target.id,
      handle: target.handle,
      firstName: target.firstName,
      lastName: target.lastName,
      gender: target.gender,
      age: yearsBetween(target.bornAt, this.world.now()),
      appearance: target.appearance,
      outfit: target.outfit,
      status: target.status,
      title: cached?.title ?? null,
      online,
      locationId: locationVisible ? target.locationId : null,
      locationLabel: locationVisible ? friendlyLocationLabel(target.locationId, target.id) : null,
      statusTier: statusTierDto(target.status),
      badges: headlineBadges(cached?.badges ?? []),
      education: { label: cached?.degreeLabel ?? null, cgpa: cached?.bestCgpa ?? null },
      family: { married: cached?.married ?? false, children: cached?.childrenCount ?? 0 },
      wealth: {
        selfMadeBand: wealthBandLabel(selfMade),
        selfMade: exactWealth ? selfMade : null,
        incomeBand: income > 0 ? `${wealthBandLabel(income)}/month` : null,
        monthlyIncome: exactWealth ? income : null,
        exact: exactWealth,
      },
      generation: target.generation,
      friendCount,
      mutualFriends: mutual,
      relationship,
      pendingRequestId: pair?.status === 'pending' ? pair.id : null,
      blockedByYou,
    };
  }

  // ----- Who's here ---------------------------------------------------------------------------------------------

  /**
   * Players at a venue: online players first (presence), then characters there on autopilot. If you're not there
   * yourself you only see your friends (no stalking strangers across Lagos), plus the head count.
   */
  async whoIsHere(ctx: SimulationContext, venueId: string): Promise<VenuePlayersDto> {
    const venue = findVenue(venueId);
    if (!venue || isHomeLocation(venueId)) throw new ResourceNotFoundException('Venue');
    const viewerId = ctx.character.id;
    const youAreHere = ctx.character.locationId === venueId;

    const live = await this.presence.playersAt(venueId, VENUE_LIST_LIMIT);
    const liveIds = live.map((player) => player.characterId);
    const rows: VenuePlayerRow[] = await ctx.manager.query(
      `SELECT ${CARD_COLUMNS}, c.gender, c.appearance, c.outfit, c.activity, COUNT(*) OVER () AS total
         FROM characters c
    LEFT JOIN social_profiles p ON p.character_id = c.id
        WHERE c.alive AND c.location_id = $1 AND c.id <> $2
          AND NOT EXISTS (
                SELECT 1 FROM social_blocks b
                 WHERE (b.blocker_id = $2 AND b.blocked_id = c.id) OR (b.blocker_id = c.id AND b.blocked_id = $2))
     ORDER BY (c.id = ANY($3::uuid[])) DESC, c.status DESC, c.last_active_at DESC
        LIMIT 200`,
      [venueId, viewerId, liveIds],
    );
    const friendIds = new Set(await this.friends.friendIds(viewerId, ctx.manager));
    const visible = (youAreHere ? rows : rows.filter((row) => friendIds.has(row.id))).slice(0, VENUE_LIST_LIMIT);
    const online = await this.cards.onlineSet(visible.map((row) => row.id));

    const players: VenuePlayerDto[] = visible
      .map((row) => ({
        ...this.cards.toCard(row, online.has(row.id)),
        gender: row.gender,
        appearance: row.appearance,
        outfit: row.outfit,
        activity: row.activity?.actionId ?? null,
        isFriend: friendIds.has(row.id),
      }))
      .toSorted((a, b) => Number(b.online) - Number(a.online) || Number(b.isFriend) - Number(a.isFriend) || b.status - a.status);

    return { venueId, venueName: venue.name, total: Number(rows[0]?.total ?? 0), youAreHere, players };
  }

  /** For the social system: is the cache old enough to refresh on this settle? */
  async needsRefresh(ctx: SimulationContext): Promise<boolean> {
    return this.isStale(await this.cached(ctx), ctx.time);
  }

  /** Uncached read for other services. */
  findCached(characterId: string, manager: EntityManager = this.dataSource.manager): Promise<SocialProfileEntity | null> {
    return manager.findOne(SocialProfileEntity, { where: { characterId } });
  }
}
