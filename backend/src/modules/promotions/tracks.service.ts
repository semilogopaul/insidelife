import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, LessThanOrEqual, MoreThan, type DataSource, type EntityManager, type Repository } from 'typeorm';
import {
  ARTIST_NAME_MAX,
  CLUB_PLAY_MAX_LEAD_DAYS,
  CLUB_PLAY_PRODUCT,
  CLUB_ROTATION_CAPACITY,
  PROMOTION_TITLE_MAX,
  TRACK_MAX_BYTES,
  clubPlayVenues,
  findClubPlayProduct,
  findVenue,
  isClubPlayVenue,
  type ClubOrderCheckoutDto,
  type ClubPlayProduct,
  type ClubSongOfferDto,
  type ClubRotationDto,
  type ClubRotationTrackDto,
  type ClubTrackDto,
  type IsoDate,
  type PromotionStatus,
} from '@insidelife/shared';
import { RateLimitedException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import {
  CHECKOUT_PORT,
  type CheckoutPort,
  type CheckoutRefund,
  type CheckoutSession,
  type FulfilmentResult,
  type PaidCheckout,
} from '../../common/ports/checkout.port.js';
import { withTransaction } from '../../database/transaction.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { AdRatesService } from './ad-rates.service.js';
import type { CreateClubOrderDto, UploadTrackDto } from './dto/track.dto.js';
import { ClubPlayOrderEntity } from './entities/club-play-order.entity.js';
import { ClubTrackEntity } from './entities/club-track.entity.js';
import { inspectTrack } from './media/audio-inspector.js';
import { appendModerationLog } from './moderation-log.js';
import { advisoryLock, CHECKOUT_HOLD_MINUTES, LIVE_FEED_CACHE_MS, UUID_PATTERN } from './promotions.constants.js';
import { clockAt, toClubOrderDto, toTrackDto, type Clock } from './promotions.mappers.js';
import { autoRefundNotice, paidNotice, refundedNotice, type NoticeSubject } from './promotions.notices.js';
import { applyRefundToItem, revertRefundOnItem } from './promotion-refunds.js';
import { InvalidMediaException, PromotionRuleException, PromotionStateException } from './promotions.errors.js';
import { PromotionsNotifier } from './promotions-notifier.service.js';
import type { Buyer, UploadedMedia } from './promotions.types.js';
import { validateDisplayText } from './rules/content.rules.js';
import { isTrackType, sniffMedia } from '../../common/media/media-sniff.js';
import { firstFullClub, nextFreeClubStart, rangeOf, type DateRange } from './rules/schedule.rules.js';
import { admitAfterPayment, COMMITTED_STATUSES, matchPayment } from './rules/status.rules.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { CachedValue } from './util/cached-value.js';
import { assertExpectedPrice, assertExpectedStart } from './util/dates.js';

const MAX_UNPAID_ORDERS = 3;
const DAILY_TRACK_UPLOADS = 10;
const ORDERS_PER_TRACK_SHOWN = 10;
const ROTATION_LOCK = 'promotions:club-rotation';

const allClubIds = (): string[] => clubPlayVenues().map((venue) => venue.id);

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
 * Club DJ: song uploads (validated MP3/OGG of 3 minutes or less, stored as-is), rotation orders (one product: ₦5,000 for
 * 7 days in every club and lounge) + checkout, payment fulfilment, refunds and the public per-club rotation feed.
 * A track has at most one open order; ordering again replaces an unpaid one.
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
    private readonly rates: AdRatesService,
  ) {}

  onModuleInit(): void {
    this.checkout.registerFulfiller({
      purpose: 'club-play',
      fulfill: (payment) => this.applyPayment(payment),
      onRefunded: (payment, refund) => this.applyRefund(payment, refund),
      onRefundFailed: async (payment, refund) => {
        if (UUID_PATTERN.test(payment.subjectId)) await revertRefundOnItem(this.dataSource, ClubPlayOrderEntity, 'club-order', payment, refund);
      },
    });
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
    const selection = this.resolveClubs(request.clubs);
    const clock = clockAt();
    // The price is quoted now and stored on the order: a later rate change never touches it.
    const priceKobo = await this.rates.rateKobo('club-song');
    assertExpectedPrice(request.expectedPriceKobo, { weekPriceKobo: priceKobo, totalKobo: priceKobo }, 'song');
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

      const startDate = await this.nextStart(manager, allClubIds(), clock, product.days);
      if (!startDate) throw new PromotionRuleException('CLUB_FULL', 'Every club’s rotation is full for the next month. Try again in a few days');
      assertExpectedStart(request.expectedStartDate, startDate, 'The club rotation');
      const range = rangeOf(startDate, product.days);

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
          amountKobo: priceKobo,
          status: 'pending-payment',
          holdExpiresAt: new Date(clock.now.getTime() + CHECKOUT_HOLD_MINUTES * 60_000),
        }),
      );
      return { track: owned, order: created };
    });

    const session = await this.startCheckout(user, character, track, order, product);
    return {
      orderId: order.id,
      reference: session.reference,
      authorizationUrl: session.authorizationUrl,
      quote: { weeks: 1, days: product.days, weekPriceKobo: order.amountKobo, totalKobo: order.amountKobo },
      order: toClubOrderDto(order, clock),
    };
  }

  /** The Club DJ product as it can be bought now: current price and when an order placed now would start. */
  async offer(): Promise<ClubSongOfferDto> {
    const clock = clockAt();
    const [priceKobo, startDate] = await Promise.all([this.rates.rateKobo('club-song'), this.nextStart(this.orders.manager, allClubIds(), clock, CLUB_PLAY_PRODUCT.days)]);
    return { priceKobo, days: CLUB_PLAY_PRODUCT.days, startDate };
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

  /** Every order plays in every club and lounge (older single-club orders still play where they were booked). */
  private resolveClubs(clubs: readonly string[] | undefined): ClubSelection {
    if ((clubs ?? []).some((club) => club !== 'all')) throw new PromotionRuleException('INVALID_CLUBS', 'Your song plays in every club and lounge — no need to pick one');
    return { allClubs: true, clubs: [] };
  }

  /** A new order replaces the track's unpaid ones (their late payments are still honoured or refunded). */
  private async cancelUnpaidOrders(manager: EntityManager, trackId: string, userId: string): Promise<void> {
    const stale = await manager.find(ClubPlayOrderEntity, { where: { trackId, status: 'pending-payment' } });
    for (const order of stale) {
      await manager.update(ClubPlayOrderEntity, { id: order.id, status: 'pending-payment' }, { status: 'cancelled', holdExpiresAt: null, checkoutUrl: null });
      await appendModerationLog(manager, { subjectType: 'club-order', subjectId: order.id, action: 'cancelled', fromStatus: 'pending-payment', toStatus: 'cancelled', actorUserId: userId, reason: 'Replaced by a new order' });
    }
  }

  private async startCheckout(user: AuthUser, character: Buyer | null, track: ClubTrackEntity, order: ClubPlayOrderEntity, product: ClubPlayProduct): Promise<CheckoutSession> {
    let session: CheckoutSession;
    try {
      session = await this.checkout.start({
        userId: user.userId,
        email: user.email,
        customerName: character ? `@${character.handle}` : undefined,
        characterId: character?.id ?? null,
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

  /** Checkout fulfiller for 'club-play'. Same contract as the billboard fulfiller (idempotent, refunds instead of throwing). */
  private async applyPayment(payment: PaidCheckout): Promise<FulfilmentResult> {
    if (!UUID_PATTERN.test(payment.subjectId)) {
      this.logger.error({ reference: payment.reference, subjectId: payment.subjectId }, 'Club-play payment for a malformed order id; refunding');
      return { kind: 'refund', reason: 'Payment for an unknown order' };
    }
    const clock = clockAt();
    const result = await withTransaction(this.dataSource, async (manager) => {
      const order = await manager.findOne(ClubPlayOrderEntity, { where: { id: payment.subjectId }, lock: { mode: 'pessimistic_write' } });
      if (!order) {
        this.logger.error({ reference: payment.reference, orderId: payment.subjectId }, 'Club-play payment for an unknown order; refunding');
        return { kind: 'refund', reason: 'Payment for an unknown order' } as const;
      }
      const match = matchPayment(order, payment.reference);
      if (match === 'already-fulfilled') return { kind: 'delivered' } as const;
      if (match === 'duplicate') {
        this.logger.error({ reference: payment.reference, orderId: order.id }, 'Second payment for an already-paid club order; refunding it');
        await appendModerationLog(manager, {
          subjectType: 'club-order',
          subjectId: order.id,
          action: 'duplicate-payment',
          fromStatus: order.status,
          toStatus: order.status,
          paymentReference: payment.reference,
          reason: 'Duplicate payment — refunded automatically',
        });
        return { kind: 'refund', reason: 'Duplicate payment for an order that was already paid' } as const;
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
      return { kind: 'applied', order, track, admission } as const;
    });

    if (result.kind !== 'applied') return result;
    const { order, track, admission } = result;
    this.logger.log({ orderId: order.id, reference: payment.reference, status: order.status }, 'Club-play payment applied');
    const subject = trackSubject(track, order);
    await this.notifier.notifyOwner(order.ownerUserId, admission.kind === 'review' ? paidNotice(subject) : autoRefundNotice(subject, admission.reason));
    return admission.kind === 'review' ? { kind: 'delivered' } : { kind: 'refund', reason: admission.reason };
  }

  /** `onRefunded` for 'club-play' payments: settle the order (see `applyRefundToItem`) and tell the artist. */
  private async applyRefund(payment: PaidCheckout, refund: CheckoutRefund): Promise<void> {
    if (!UUID_PATTERN.test(payment.subjectId)) return;
    const applied = await applyRefundToItem(this.dataSource, ClubPlayOrderEntity, 'club-order', payment, refund);
    if (applied?.settlement.kind !== 'refunded') return;
    if (applied.settlement.takenDown) this.invalidateRotation();
    const track = await this.tracks.findOne({ where: { id: applied.item.trackId } });
    this.logger.log({ orderId: applied.item.id, reference: payment.reference, refundId: refund.refundId }, 'Club order refunded');
    await this.notifier.notifyOwner(applied.item.ownerUserId, refundedNotice(trackSubject(track, applied.item), refund.amountKobo));
  }

  /** First day a run of `days` fits in every one of `clubs` (today when they all have room), or null within 30 days. */
  private async nextStart(manager: EntityManager, clubs: readonly string[], clock: Clock, days: number): Promise<IsoDate | null> {
    const orders = await this.activeOrders(manager, rangeOf(clock.today, CLUB_PLAY_MAX_LEAD_DAYS + days), clock.now);
    return nextFreeClubStart(orders, clubs, clock.today, days, CLUB_ROTATION_CAPACITY, CLUB_PLAY_MAX_LEAD_DAYS);
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
