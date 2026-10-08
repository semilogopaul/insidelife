import {
  BLUEPRINTS,
  DISTRICTS,
  LAND_TITLES,
  PLOT_SQM,
  renewalAmount,
  type BuildingDto,
  type ConstructionDto,
  type HomeComfortDto,
  type HomeDto,
  type LeaseDto,
  type PropertyDto,
} from '@insidelife/shared';
import type { BuildingEntity } from './entities/building.entity.js';
import type { LeaseEntity } from './entities/lease.entity.js';
import type { PropertySaleEntity } from './entities/property-sale.entity.js';
import type { PropertyEntity } from './entities/property.entity.js';
import type { HomeState } from './home.service.js';
import { buildingValue, constructionProgress, days, increasedRent, landValue, nextMilestoneAmount, propertyValue } from './housing.rules.js';

/** Entity → API DTO conversions (pure). */

export function toHomeDto(home: HomeState, comfort: HomeComfortDto, prestige: number, livingCostMultiplier: number): HomeDto {
  return {
    ownership: home.ownership,
    label: home.label,
    districtId: home.districtId,
    districtName: DISTRICTS[home.districtId].name,
    typeId: home.typeId,
    blueprintId: home.blueprintId,
    bedrooms: home.bedrooms,
    comfort: { home: comfort.home, area: comfort.area, furniture: comfort.furniture, power: comfort.power, total: comfort.total },
    prestige,
    livingCostMultiplier,
    movedInAt: home.movedInAt,
    leaseId: home.leaseId,
    propertyId: home.propertyId,
  };
}

export function toLeaseDto(lease: LeaseEntity): LeaseDto {
  const decided = lease.renewalDecidedFor === lease.endAt;
  const nextAnnualRent = decided ? increasedRent(lease.annualRent, lease.pendingIncrease) : null;
  return {
    id: lease.id,
    label: lease.label,
    districtId: lease.districtId,
    type: lease.typeId,
    annualRent: lease.annualRent,
    serviceCharge: lease.serviceCharge,
    cautionDeposit: lease.cautionDeposit,
    startAt: lease.startAt,
    endAt: lease.endAt,
    status: lease.status,
    nextAnnualRent,
    renewalYears: lease.renewalYears,
    renewalAmount: renewalAmount(nextAnnualRent ?? lease.annualRent, lease.serviceCharge, lease.renewalYears),
    nonRenewing: lease.nonRenewing,
    graceUntil: lease.graceUntil,
    evictAt: lease.evictAt,
  };
}

export function toConstructionDto(building: BuildingEntity, now: number): ConstructionDto {
  const remainingDays = Math.max(0, building.durationDays - building.progressDays);
  const plannedMilestone = building.paymentPlan === 'milestones' && building.milestonesPaid < building.milestones;
  return {
    buildingId: building.id,
    propertyId: building.propertyId,
    blueprintId: building.blueprintId,
    label: BLUEPRINTS[building.blueprintId].label,
    progress: Math.round(constructionProgress(building) * 1000) / 1000,
    budget: building.budget,
    costPaid: building.costPaid,
    paymentPlan: building.paymentPlan,
    startedAt: building.startedAt,
    estimatedCompletionAt: now + days(remainingDays),
    stalled: building.stalledSince !== null,
    nextMilestoneAmount: plannedMilestone ? nextMilestoneAmount(building) : 0,
    pendingOverrun: building.overrun?.amount ?? 0,
  };
}

export function toBuildingDto(building: BuildingEntity, now: number): BuildingDto {
  const tenants = building.units.filter((unit) => unit.tenant !== null);
  const dueDates = tenants.map((unit) => unit.paidUntil).filter((t): t is number => t !== null);
  return {
    id: building.id,
    blueprintId: building.blueprintId,
    label: BLUEPRINTS[building.blueprintId].label,
    status: building.status,
    value: buildingValue(building),
    condition: Math.round(building.condition),
    occupancy: building.status !== 'complete' ? null : building.ownerOccupied ? 'owner-occupied' : building.letting ? 'let' : 'vacant',
    units: BLUEPRINTS[building.blueprintId].units,
    unitsLet: tenants.length,
    annualRentRoll: tenants.reduce((sum, unit) => sum + unit.annualRent, 0),
    nextRentDueAt: dueDates.length > 0 ? Math.min(...dueDates) : null,
    construction: building.status === 'under-construction' ? toConstructionDto(building, now) : null,
  };
}

export function toPropertyDto(property: PropertyEntity, building: BuildingEntity | null, sale: PropertySaleEntity | null, now: number): PropertyDto {
  return {
    id: property.id,
    label: property.label,
    districtId: property.districtId,
    districtName: DISTRICTS[property.districtId].name,
    title: property.title,
    titleLabel: LAND_TITLES[property.title].label,
    plots: property.plots,
    sizeSqm: property.plots * PLOT_SQM,
    status: property.status,
    purchasePrice: property.purchasePrice,
    costBasis: property.costBasis,
    landValue: landValue(property),
    buildingValue: buildingValue(building),
    value: propertyValue(property, building),
    valueHistory: property.valueHistory,
    arrears: property.arrears,
    dispute: property.dispute
      ? {
          kind: property.dispute.kind,
          stage: property.dispute.stage,
          openedAt: property.dispute.openedAt,
          demand: property.dispute.demand,
          courtUntil: property.dispute.courtUntil,
        }
      : null,
    titlePerfection: property.titlePerfection,
    building: building ? toBuildingDto(building, now) : null,
    sale: sale ? { id: sale.id, listedAt: sale.listedAt, closesAt: sale.closesAt, askingPrice: sale.askingPrice, agentRate: sale.agentRate } : null,
    acquiredAt: property.acquiredAt,
  };
}
