import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, LessThanOrEqual, MoreThan, type DataSource, type EntityManager, type Repository } from 'typeorm';
import {
  ARTIST_NAME_MAX,
  CLUB_PLAY_MAX_LEAD_DAYS,
  CLUB_ROTATION_CAPACITY,
  PROMOTION_TITLE_MAX,
  TRACK_MAX_BYTES,
  clubPlayVenues,
  findClubPlayProduct,
  findVenue,
  isClubPlayVenue,
  type ClubOrderCheckoutDto,
  type ClubPlayProduct,
  type ClubRotationDto,
  type ClubRotationTrackDto,
  type ClubTrackDto,
  type PromotionStatus,
} from '@insidelife/shared';
import { RateLimitedException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CHECKOUT_PORT, type CheckoutPort, type CheckoutSession, type PaidCheckout } from '../../common/ports/checkout.port.js';
import { withTransaction } from '../../database/transaction.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import type { CreateClubOrderDto, UploadTrackDto } from './dto/track.dto.js';
import { ClubPlayOrderEntity } from './entities/club-play-order.entity.js';
import { ClubTrackEntity } from './entities/club-track.entity.js';
import { inspectTrack } from './media/audio-inspector.js';
import { appendModerationLog } from './moderation-log.js';
import { advisoryLock, CHECKOUT_HOLD_MINUTES, LIVE_FEED_CACHE_MS, UUID_PATTERN, WINDOW_MESSAGES } from './promotions.constants.js';
import { clockAt, toClubOrderDto, toTrackDto, type Clock } from './promotions.mappers.js';
import { autoRefundNotice, paidNotice, type NoticeSubject } from './promotions.notices.js';
import { InvalidMediaException, PromotionRuleException, PromotionStateException } from './promotions.errors.js';
import { PromotionsNotifier } from './promotions-notifier.service.js';
import type { UploadedMedia } from './promotions.types.js';
import { validateDisplayText } from './rules/content.rules.js';
import { isTrackType, sniffMedia } from './rules/media-sniff.js';
import { bookingWindowProblem, firstFullClub, rangeOf, type DateRange } from './rules/schedule.rules.js';
import { admitAfterPayment, COMMITTED_STATUSES, matchPayment } from './rules/status.rules.js';
import { StorageService } from './storage/storage.service.js';
import { CachedValue } from './util/cached-value.js';

const MAX_UNPAID_ORDERS = 3;
const DAILY_TRACK_UPLOADS = 10;
const ORDERS_PER_TRACK_SHOWN = 10;
const ROTATION_LOCK = 'promotions:club-rotation';

interface Rotation {
  readonly generatedAt: string;
  readonly byVenue: ReadonlyMap<string, readonly ClubRotationTrackDto[]>;
  /** `${trackId}:${venueId}` → live order id, for play counting. */
  readonly liveOrders: ReadonlyMap<string, string>;
}

interface ClubSelection {
  readonly allClubs: boolean;
  readonly clubs: string[];
}

export function clubsLabel(order: Pick<ClubPlayOrderEntity, 'allClubs' | 'clubs'>): string {
  if (order.allClubs) return 'every club in Lagos';
  return order.clubs.map((id) => findVenue(id)?.name ?? id).join(', ');
}

export const trackSubject = (track: Pick<ClubTrackEntity, 'artistName' | 'title'> | null, order: Pick<ClubPlayOrderEntity, 'allClubs' | 'clubs'>): NoticeSubject => ({
  noun: 'Club rotation',
  name: track ? `${track.artistName} – ${track.title}` : 'your song',
  where: clubsLabel(order),
});

/**
 * Club DJ: song uploads (validated MP3/OGG stored as-is), rotation orders + checkout, payment fulfilment and the
 * public per-club rotation feed. A track has at most one open order; ordering again replaces an unpaid one.
 */
@Injectable()
export class TracksService implements OnModuleInit {
  private readonly logger = new Logger(TracksService.name);
  private readonly rotationCache = new CachedValue<Rotation>(LIVE_FEED_CACHE_MS, () => this.loadRotation());

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ClubTrackEntity) private readonly tracks: Repository<ClubTrackEntity>,
    @InjectRepository(ClubPlayOrderEntity) private readonly orders: Repository<ClubPlayOrderEntity>,
    @Inject(CHECKOUT_PORT) private readonly checkout: CheckoutPort,
    private readonly storage: StorageService,
    private readonly directory: CharacterDirectory,
    private readonly notifier: PromotionsNotifier,
  ) {}

  onModuleInit(): void {
    this.checkout.registerFulfiller({ purpose: 'club-play', fulfill: (payment) => this.applyPayment(payment) });
  }

  async upload(user: AuthUser, fields: UploadTrackDto, file: UploadedMedia | undefined): Promise<ClubTrackDto> {
    const artist = validateDisplayText(fields.artistName, 'Artist name', 2, ARTIST_NAME_MAX);
    if (!artist.ok) throw new PromotionRuleException('INVALID_ARTIST', artist.reason);
    const title = validateDisplayText(fields.title, 'Song title', 1, PROMOTION_TITLE_MAX);
    if (!title.ok) throw new PromotionRuleException('INVALID_TITLE', title.reason);
    if (!file || file.size === 0) throw new InvalidMediaException('Choose a song to upload');
    if (file.size > TRACK_MAX_BYTES) throw new InvalidMediaException(`Songs can be at most ${TRACK_MAX_BYTES / 1024 / 1024} MB`);
    const sniffed = sniffMedia(file.buffer);
    if (!isTrackType(sniffed)) throw new InvalidMediaException('Upload an MP3 or OGG song');

    const recent = await this.tracks.count({ where: { ownerUserId: user.userId, createdAt: MoreThan(new Date(Date.now() - 86_400_000)) } });
    if (recent >= DAILY_TRACK_UPLOADS) throw new RateLimitedException('That’s a lot of uploads today — try again tomorrow');

    const audio = await inspectTrack(file.buffer, sniffed);
    const character = await this.directory.findLivingByUser(user.userId);
    const stored = await this.storage.put(this.storage.newKey('tracks', sniffed === 'audio/ogg' ? 'ogg' : 'mp3'), file.buffer, audio.contentType);
    try {
      const track = await this.tracks.save(
        this.tracks.create({
          ownerUserId: user.userId,
          ownerCharacterId: character?.id ?? null,
          artistName: artist.value,
          title: title.value,
          audioKey: stored.key,
          audioUrl: stored.url,
          contentType: audio.contentType,
          durationSeconds: audio.durationSeconds,
          bytes: stored.bytes,
          removedAt: null,
        }),
      );
      return toTrackDto(track, [], clockAt());
    } catch (error) {
      await this.storage.remove(stored.key);
      throw error;
    }
  }

  async listMine(userId: string): Promise<ClubTrackDto[]> {
    const clock = clockAt();
    const tracks = await this.tracks.find({ where: { ownerUserId: userId }, order: { createdAt: 'DESC' }, take: 50 });
    if (tracks.length === 0) return [];
    const orders = await this.orders.find({ where: { trackId: In(tracks.map((track) => track.id)) }, order: { createdAt: 'DESC' } });
    return tracks.map((track) =>
      toTrackDto(
        track,
        orders.filter((order) => order.trackId === track.id).slice(0, ORDERS_PER_TRACK_SHOWN),
        clock,
      ),
    );
  }

  async order(user: AuthUser, trackId: string, request: CreateClubOrderDto): Promise<ClubOrderCheckoutDto> {
    const product = findClubPlayProduct(request.productId);
    if (!product) throw new ResourceNotFoundException('Package');
    const selection = this.resolveClubs(product, request.clubs);
    const clock = clockAt();
    const startDate = request.startDate ?? clock.today;
    const problem = bookingWindowProblem(startDate, product.days, clock.today, { minDays: product.days, maxDays: product.days, maxLeadDays: CLUB_PLAY_MAX_LEAD_DAYS });
    if (problem) throw new PromotionRuleException('INVALID_DATES', WINDOW_MESSAGES[problem]);
    const range = rangeOf(startDate, product.days);
    const character = await this.directory.findLivingByUser(user.userId);

    const { track, order } = await withTransaction(this.dataSource, async (manager) => {
      await advisoryLock(manager, ROTATION_LOCK);
      const owned = await manager.findOne(ClubTrackEntity, { where: { id: trackId, ownerUserId: user.userId }, lock: { mode: 'pessimistic_write' } });
      if (!owned) throw new ResourceNotFoundException('Song');
      if (owned.removedAt) throw new PromotionStateException('This song was removed after review. Upload it again to book a new rotation');

      const running = await manager.findOne(ClubPlayOrderEntity, {
        where: { trackId, status: In([...COMMITTED_STATUSES]), endDate: MoreThan(clock.today) },
        order: { endDate: 'DESC' },
      });
      if (running) throw new PromotionStateException(`This song already has a rotation booked until ${running.endDate}`);

      const unpaid = await manager.count(ClubPlayOrderEntity, {
        where: { ownerUserId: user.userId, status: 'pending-payment', holdExpiresAt: MoreThan(clock.now) },
      });
      if (unpaid >= MAX_UNPAID_ORDERS) throw new PromotionRuleException('TOO_MANY_UNPAID', 'Pay for or cancel your unpaid orders first');
      await this.cancelUnpaidOrders(manager, trackId, user.userId);

      const targets = selection.allClubs ? clubPlayVenues().map((venue) => venue.id) : selection.clubs;
      const full = firstFullClub(await this.activeOrders(manager, range, clock.now), targets, range, CLUB_ROTATION_CAPACITY);
      if (full) {
        const name = findVenue(full.club)?.name ?? full.club;
        throw new PromotionRuleException('CLUB_FULL', `${name}’s rotation is full on ${full.date}. Pick other dates or another club`);
      }

      const created = await manager.save(
        manager.create(ClubPlayOrderEntity, {
          trackId,
          ownerUserId: user.userId,
          ownerCharacterId: character?.id ?? null,
          productId: product.id,
          allClubs: selection.allClubs,
          clubs: selection.clubs,
          startDate: range.startDate,
          endDate: range.endDate,
          days: product.days,
          amountKobo: product.priceKobo,
          status: 'pending-payment',
          holdExpiresAt: new Date(clock.now.getTime() + CHECKOUT_HOLD_MINUTES * 60_000),
        }),
      );
      return { track: owned, order: created };
    });

    const session = await this.startCheckout(user, character?.id ?? null, track, order, product);
    return {
      orderId: order.id,
      reference: session.reference,
      authorizationUrl: session.authorizationUrl,
      quote: { days: product.days, unitPriceKobo: product.priceKobo, subtotalKobo: product.priceKobo, discountKobo: 0, totalKobo: product.priceKobo },
      order: toClubOrderDto(order, clock),
    };
  }

  async rotation(venueId: string): Promise<ClubRotationDto> {
    if (!isClubPlayVenue(venueId)) throw new ResourceNotFoundException('Club');
    const rotation = await this.rotationCache.get();
    return { venueId, generatedAt: rotation.generatedAt, tracks: rotation.byVenue.get(venueId) ?? [] };
  }

  /** The live order a play in this club counts toward, or null if the track isn't in that club's rotation. */
  async liveOrderId(trackId: string, venueId: string): Promise<string | null> {
    return (await this.rotationCache.get()).liveOrders.get(`${trackId}:${venueId}`) ?? null;
  }

  invalidateRotation(): void {
    this.rotationCache.invalidate();
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private resolveClubs(product: ClubPlayProduct, clubs: readonly string[] | undefined): ClubSelection {
    const requested = clubs ?? [];
    if (product.scope === 'all-clubs') {
      if (requested.some((club) => club !== 'all')) throw new PromotionRuleException('INVALID_CLUBS', 'This package plays in every club — no need to pick one');
      return { allClubs: true, clubs: [] };
    }
    const [venueId] = requested;
    if (requested.length !== 1 || venueId === undefined || !isClubPlayVenue(venueId)) {
      throw new PromotionRuleException('INVALID_CLUBS', 'Pick one club or lounge for this package');
    }
    return { allClubs: false, clubs: [venueId] };
  }

  /** A new order replaces the track's unpaid ones (their late payments are still honoured or refunded). */
  private async cancelUnpaidOrders(manager: EntityManager, trackId: string, userId: string): Promise<void> {
    const stale = await manager.find(ClubPlayOrderEntity, { where: { trackId, status: 'pending-payment' } });
    for (const order of stale) {
      await manager.update(ClubPlayOrderEntity, { id: order.id, status: 'pending-payment' }, { status: 'cancelled', holdExpiresAt: null, checkoutUrl: null });
      await appendModerationLog(manager, { subjectType: 'club-order', subjectId: order.id, action: 'cancelled', fromStatus: 'pending-payment', toStatus: 'cancelled', actorUserId: userId, reason: 'Replaced by a new order' });
    }
  }

  private async startCheckout(user: AuthUser, characterId: string | null, track: ClubTrackEntity, order: ClubPlayOrderEntity, product: ClubPlayProduct): Promise<CheckoutSession> {
    let session: CheckoutSession;
    try {
      session = await this.checkout.start({
        userId: user.userId,
        email: user.email,
        characterId,
        purpose: 'club-play',
        amountKobo: order.amountKobo,
        description: `Inside Life club play: ${track.artistName} – ${track.title} (${product.name})`.slice(0, 120),
        subjectId: order.id,
      });
    } catch (error) {
      await this.releaseFailedCheckout(order.id);
      throw error;
    }
    await this.orders.update({ id: order.id }, { paymentReference: session.reference, checkoutUrl: session.authorizationUrl });
    order.paymentReference = session.reference;
    order.checkoutUrl = session.authorizationUrl;
    return session;
  }

  private async releaseFailedCheckout(orderId: string): Promise<void> {
    try {
      await withTransaction(this.dataSource, async (manager) => {
        const result = await manager.update(ClubPlayOrderEntity, { id: orderId, status: 'pending-payment' }, { status: 'cancelled', holdExpiresAt: null });
        if (result.affected) {
          await appendModerationLog(manager, { subjectType: 'club-order', subjectId: orderId, action: 'checkout-failed', fromStatus: 'pending-payment', toStatus: 'cancelled' });
        }
      });
    } catch (error) {
      this.logger.warn({ err: error, orderId }, 'Could not release an order after a failed checkout; its hold will lapse');
    }
  }

  /** Checkout fulfiller for 'club-play'. Same contract as the billboard fulfiller (idempotent, no permanent throws). */
  private async applyPayment(payment: PaidCheckout): Promise<void> {
    if (!UUID_PATTERN.test(payment.subjectId)) {
      this.logger.error({ reference: payment.reference, subjectId: payment.subjectId }, 'Club-play payment for a malformed order id; refund manually');
      return;
    }
    const clock = clockAt();
    const result = await withTransaction(this.dataSource, async (manager) => {
      const order = await manager.findOne(ClubPlayOrderEntity, { where: { id: payment.subjectId }, lock: { mode: 'pessimistic_write' } });
      if (!order) {
        this.logger.error({ reference: payment.reference, orderId: payment.subjectId }, 'Club-play payment for an unknown order; refund manually');
        return null;
      }
      const match = matchPayment(order, payment.reference);
      if (match === 'already-fulfilled') return null;
      if (match === 'duplicate') {
        this.logger.error({ reference: payment.reference, orderId: order.id }, 'Second payment for an already-paid club order; refund manually');
        await appendModerationLog(manager, {
          subjectType: 'club-order',
          subjectId: order.id,
          action: 'duplicate-payment',
          fromStatus: order.status,
          toStatus: order.status,
          paymentReference: payment.reference,
          reason: 'Duplicate payment — refund this reference in Paystack',
        });
        return null;
      }

      await advisoryLock(manager, ROTATION_LOCK);
      const track = await manager.findOne(ClubTrackEntity, { where: { id: order.trackId } });
      const otherRunning = await manager.count(ClubPlayOrderEntity, {
        where: { trackId: order.trackId, status: In([...COMMITTED_STATUSES]), endDate: MoreThan(clock.today) },
      });
      const targets = order.allClubs ? clubPlayVenues().map((venue) => venue.id) : order.clubs;
      const others = await this.activeOrders(manager, order, clock.now, order.id);
      const admission = admitAfterPayment({
        range: order,
        today: clock.today,
        amountKobo: order.amountKobo,
        paidKobo: payment.amountKobo,
        hasRoom: track !== null && track.removedAt === null && otherRunning === 0 && firstFullClub(others, targets, order, CLUB_ROTATION_CAPACITY) === null,
      });

      const from = order.status;
      order.paidAt = payment.paidAt;
      order.paymentReference = payment.reference;
      order.holdExpiresAt = null;
      order.checkoutUrl = null;
      if (admission.kind === 'review') {
        order.status = 'in-review';
      } else {
        order.status = 'refund-due';
        order.rejectionReason = admission.reason;
      }
      await manager.save(order);
      await appendModerationLog(manager, {
        subjectType: 'club-order',
        subjectId: order.id,
        action: admission.kind === 'review' ? 'paid' : 'refund-flagged',
        fromStatus: from,
        toStatus: order.status,
        paymentReference: payment.reference,
        reason: admission.kind === 'refund' ? admission.reason : null,
      });
      return { order, track, admission };
    });

    if (!result) return;
    const { order, track, admission } = result;
    this.logger.log({ orderId: order.id, reference: payment.reference, status: order.status }, 'Club-play payment applied');
    const subject = trackSubject(track, order);
    await this.notifier.notifyOwner(order.ownerUserId, admission.kind === 'review' ? paidNotice(subject) : autoRefundNotice(subject, admission.reason));
  }

  /** Orders that take a rotation place on their dates: paid & not refused, or unpaid with a live hold. */
  private activeOrders(manager: EntityManager, range: DateRange, now: Date, excludeId?: string): Promise<ClubPlayOrderEntity[]> {
    const query = manager
      .createQueryBuilder(ClubPlayOrderEntity, 'o')
      .select(['o.id', 'o.status', 'o.allClubs', 'o.clubs', 'o.startDate', 'o.endDate', 'o.holdExpiresAt'])
      .where('o.endDate > :from AND o.startDate < :to', { from: range.startDate, to: range.endDate })
      .andWhere(
        new Brackets((where) => {
          where.where('o.status IN (:...committed)', { committed: COMMITTED_STATUSES }).orWhere("(o.status = 'pending-payment' AND o.holdExpiresAt > :now)", { now });
        }),
      );
    if (excludeId) query.andWhere('o.id <> :excludeId', { excludeId });
    return query.getMany();
  }

  private async reconcile(clock: Clock): Promise<void> {
    const runningStatuses: PromotionStatus[] = ['approved', 'live'];
    await this.orders.update({ status: In(runningStatuses), endDate: LessThanOrEqual(clock.today) }, { status: 'completed' });
    await this.orders.update({ status: 'approved', startDate: LessThanOrEqual(clock.today), endDate: MoreThan(clock.today) }, { status: 'live' });
  }

  private async loadRotation(): Promise<Rotation> {
    const clock = clockAt();
    try {
      await this.reconcile(clock);
    } catch (error) {
      this.logger.warn({ err: error }, 'Club order reconcile failed; serving by date anyway');
    }
    const running = await this.orders.find({
      where: { status: In(['approved', 'live']), startDate: LessThanOrEqual(clock.today), endDate: MoreThan(clock.today) },
      order: { paidAt: 'ASC', id: 'ASC' },
    });
    const trackIds = [...new Set(running.map((order) => order.trackId))];
    const tracks = trackIds.length === 0 ? [] : await this.tracks.find({ where: { id: In(trackIds), removedAt: IsNull() } });
    const trackById = new Map(tracks.map((track) => [track.id, track]));

    const byVenue = new Map<string, ClubRotationTrackDto[]>();
    const liveOrders = new Map<string, string>();
    for (const venue of clubPlayVenues()) {
      const entries: ClubRotationTrackDto[] = [];
      for (const order of running) {
        if (entries.length >= CLUB_ROTATION_CAPACITY) break;
        const track = trackById.get(order.trackId);
        if (!track || !(order.allClubs || order.clubs.includes(venue.id))) continue;
        liveOrders.set(`${track.id}:${venue.id}`, order.id);
        entries.push({
          trackId: track.id,
          audioUrl: track.audioUrl,
          contentType: track.contentType,
          artistName: track.artistName,
          title: track.title,
          durationSeconds: track.durationSeconds,
        });
      }
      byVenue.set(venue.id, entries);
    }
    return { generatedAt: clock.now.toISOString(), byVenue, liveOrders };
  }
}
