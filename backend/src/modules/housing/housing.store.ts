import { Injectable } from '@nestjs/common';
import { In, MoreThanOrEqual } from 'typeorm';
import { BACKGROUNDS } from '@insidelife/shared';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { BuildingEntity } from './entities/building.entity.js';
import { LeaseEntity } from './entities/lease.entity.js';
import { PropertySaleEntity } from './entities/property-sale.entity.js';
import { PropertyEntity } from './entities/property.entity.js';
import { ResidenceEntity } from './entities/residence.entity.js';

const KEYS = {
  residence: 'residence',
  lease: 'lease',
  portfolio: 'portfolio',
} as const;

/** Leases that still bind the tenant (paid, in grace, or under quit notice). */
export const OPEN_LEASE_STATUSES = ['active', 'grace', 'notice'] as const;
/** Properties the character still holds. */
export const HELD_PROPERTY_STATUSES = ['owned', 'selling'] as const;

/** Everything the character owns, loaded once per transaction and mutated in place. */
export interface Portfolio {
  readonly properties: PropertyEntity[];
  readonly buildings: BuildingEntity[];
  readonly sales: PropertySaleEntity[];
}

/**
 * Transaction-scoped access to housing state. Loads are cached per simulation context (as promises, so concurrent
 * callers — the snapshot builds its parts in parallel — share one load), a long settle queries each table once, and
 * services mutate the cached entities in place and persist them with `save`.
 */
@Injectable()
export class HousingStore {
  private readonly caches = new WeakMap<SimulationContext, Map<string, Promise<unknown>>>();

  /** Load once per transaction; every caller gets the same promise (and the same entity instances). */
  cached<T>(ctx: SimulationContext, key: string, loader: () => Promise<T>): Promise<T> {
    let cache = this.caches.get(ctx);
    if (!cache) {
      cache = new Map();
      this.caches.set(ctx, cache);
    }
    const hit = cache.get(key);
    if (hit) return hit as Promise<T>;
    const pending = loader();
    cache.set(key, pending);
    return pending;
  }

  async residence(ctx: SimulationContext): Promise<ResidenceEntity> {
    return this.cached(ctx, KEYS.residence, async () => {
      const existing = await ctx.manager.findOne(ResidenceEntity, { where: { characterId: ctx.character.id } });
      return existing ?? this.createFamilyResidence(ctx);
    });
  }

  /** Every character starts (and can always fall back to) the family house in their birth district. */
  async createFamilyResidence(ctx: SimulationContext): Promise<ResidenceEntity> {
    const character = ctx.character;
    const residence = ctx.manager.create(ResidenceEntity, {
      characterId: character.id,
      kind: 'family',
      leaseId: null,
      buildingId: null,
      familyDistrictId: character.homeDistrictId,
      familyComfort: BACKGROUNDS[character.background].homeComfort,
      movedInAt: ctx.time,
      generatorDryDay: null,
      lastFloodDay: null,
      securityUntil: null,
      familyHints: 0,
    });
    return ctx.manager.save(residence);
  }

  /** The lease that currently binds the character, if any. */
  async lease(ctx: SimulationContext): Promise<LeaseEntity | null> {
    return this.cached(ctx, KEYS.lease, () =>
      ctx.manager.findOne(LeaseEntity, {
        where: { characterId: ctx.character.id, status: In([...OPEN_LEASE_STATUSES]) },
        order: { startAt: 'DESC' },
      }),
    );
  }

  async setLease(ctx: SimulationContext, lease: LeaseEntity | null): Promise<void> {
    await this.lease(ctx);
    this.caches.get(ctx)?.set(KEYS.lease, Promise.resolve(lease));
  }

  async portfolio(ctx: SimulationContext): Promise<Portfolio> {
    return this.cached(ctx, KEYS.portfolio, async () => {
      const characterId = ctx.character.id;
      const properties = await ctx.manager.find(PropertyEntity, {
        where: { characterId, status: In([...HELD_PROPERTY_STATUSES]) },
        order: { acquiredAt: 'ASC' },
      });
      if (properties.length === 0) return { properties, buildings: [], sales: [] };
      const ids = properties.map((property) => property.id);
      const [buildings, sales] = await Promise.all([
        ctx.manager.find(BuildingEntity, { where: { characterId, propertyId: In(ids) }, order: { startedAt: 'ASC' } }),
        ctx.manager.find(PropertySaleEntity, { where: { characterId, propertyId: In(ids), status: 'listed' } }),
      ]);
      return { properties, buildings, sales };
    });
  }

  /** Properties still held (owned or listed for sale). */
  async heldProperties(ctx: SimulationContext): Promise<PropertyEntity[]> {
    const portfolio = await this.portfolio(ctx);
    return portfolio.properties.filter((property) => property.status === 'owned' || property.status === 'selling');
  }

  /** A held property by id, or a 404. */
  async property(ctx: SimulationContext, propertyId: string): Promise<PropertyEntity> {
    const property = (await this.heldProperties(ctx)).find((candidate) => candidate.id === propertyId);
    if (!property) throw new ResourceNotFoundException('Property');
    return property;
  }

  /** The latest building on a property (finished, in progress or demolished). */
  buildingOf(portfolio: Portfolio, propertyId: string): BuildingEntity | null {
    let latest: BuildingEntity | null = null;
    for (const building of portfolio.buildings) {
      if (building.propertyId === propertyId && (!latest || building.startedAt >= latest.startedAt)) latest = building;
    }
    return latest;
  }

  /** Every property the character acquired at or after `since`, whatever happened to it since (sold and lost included). */
  async acquiredSince(ctx: SimulationContext, since: number): Promise<PropertyEntity[]> {
    return ctx.manager.find(PropertyEntity, { where: { characterId: ctx.character.id, acquiredAt: MoreThanOrEqual(since) } });
  }

  saleOf(portfolio: Portfolio, propertyId: string): PropertySaleEntity | null {
    return portfolio.sales.find((sale) => sale.propertyId === propertyId && sale.status === 'listed') ?? null;
  }

  /** New entities join the cached portfolio (loaded first, so the fresh row isn't picked up twice). */
  async addProperty(ctx: SimulationContext, property: PropertyEntity): Promise<PropertyEntity> {
    const portfolio = await this.portfolio(ctx);
    const saved = await ctx.manager.save(property);
    portfolio.properties.push(saved);
    return saved;
  }

  async addBuilding(ctx: SimulationContext, building: BuildingEntity): Promise<BuildingEntity> {
    const portfolio = await this.portfolio(ctx);
    const saved = await ctx.manager.save(building);
    portfolio.buildings.push(saved);
    return saved;
  }

  async addSale(ctx: SimulationContext, sale: PropertySaleEntity): Promise<PropertySaleEntity> {
    const portfolio = await this.portfolio(ctx);
    const saved = await ctx.manager.save(sale);
    portfolio.sales.push(saved);
    return saved;
  }

  async save<T extends ResidenceEntity | LeaseEntity | PropertyEntity | BuildingEntity | PropertySaleEntity>(
    ctx: SimulationContext,
    entity: T,
  ): Promise<T> {
    return ctx.manager.save(entity);
  }
}
