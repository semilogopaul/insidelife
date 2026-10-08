import { MAX_RENT_INCREASE, MINUTES_PER_YEAR, rngFor } from '@insidelife/shared';
import {
  cautionRefund,
  conditionRentFactor,
  heldFraction,
  increasedRent,
  landUseCharge,
  lettableUnits,
  nextMilestoneAmount,
  omonileDemand,
  propertyValue,
  rollRentIncrease,
  saleProceedsSplit,
} from './housing.rules.js';

describe('rent increases', () => {
  it('are deterministic and between 0 and 30%', () => {
    let increases = 0;
    for (let i = 0; i < 500; i++) {
      const increase = rollRentIncrease(rngFor('seed', 'lease', i));
      expect(increase).toBe(rollRentIncrease(rngFor('seed', 'lease', i)));
      expect(increase).toBeGreaterThanOrEqual(0);
      expect(increase).toBeLessThanOrEqual(MAX_RENT_INCREASE);
      if (increase > 0) increases++;
    }
    // Roughly 45% of landlords raise rent.
    expect(increases / 500).toBeGreaterThan(0.35);
    expect(increases / 500).toBeLessThan(0.55);
  });

  it('round the new rent to ₦10k', () => {
    expect(increasedRent(1_250_000, 0.15)).toBe(1_440_000);
    expect(increasedRent(1_250_000, 0)).toBe(1_250_000);
  });
});

describe('caution deposits', () => {
  it('come back with at most 30% deducted', () => {
    for (let i = 0; i < 200; i++) {
      const { refund, deducted } = cautionRefund(300_000, rngFor('seed', 'caution', i));
      expect(refund + deducted).toBe(300_000);
      expect(deducted).toBeLessThanOrEqual(90_000);
      expect(refund).toBeGreaterThanOrEqual(210_000);
    }
  });
});

describe('property sales', () => {
  it('count proceeds as neutral up to the cost basis and only the profit as earned', () => {
    expect(saleProceedsSplit(30_000_000, 20_000_000)).toEqual({ principal: 20_000_000, gain: 10_000_000 });
    expect(saleProceedsSplit(15_000_000, 20_000_000)).toEqual({ principal: 15_000_000, gain: 0 });
    expect(saleProceedsSplit(-5, 20_000_000)).toEqual({ principal: 0, gain: 0 });
  });
});

describe('valuation', () => {
  const plot = { marketValue: 20_000_000, title: 'survey' as const, arrears: 0 };

  it('values land by its title and adds the building by condition', () => {
    expect(propertyValue(plot, null)).toBe(10_000_000);
    expect(propertyValue({ ...plot, title: 'c-of-o' }, null)).toBe(20_000_000);
    expect(propertyValue(plot, { status: 'complete', value: 30_000_000, condition: 80, costPaid: 27_000_000 })).toBe(34_000_000);
    expect(propertyValue(plot, { status: 'under-construction', value: 0, condition: 100, costPaid: 10_000_000 })).toBe(16_000_000);
    expect(propertyValue(plot, { status: 'demolished', value: 0, condition: 100, costPaid: 10_000_000 })).toBe(10_000_000);
    expect(propertyValue({ ...plot, arrears: 500_000 }, null)).toBe(9_500_000);
  });

  it('flood-damaged units rent for less', () => {
    expect(conditionRentFactor(100)).toBe(1);
    expect(conditionRentFactor(0)).toBeCloseTo(0.6);
  });
});

describe('construction milestones', () => {
  it('spread the remaining budget so the payments add up exactly', () => {
    const building = { budget: 25_000_001, costPaid: 0, milestones: 4, milestonesPaid: 0 };
    let paid = 0;
    while (building.milestonesPaid < building.milestones) {
      const amount = nextMilestoneAmount(building);
      paid += amount;
      building.costPaid += amount;
      building.milestonesPaid += 1;
    }
    expect(paid).toBe(25_000_001);
    expect(nextMilestoneAmount(building)).toBe(0);
  });
});

describe('fees and charges', () => {
  it('pro-rates the land use charge and charges owner-occupiers less', () => {
    expect(landUseCharge(100_000_000, false, 1)).toBe(256_000);
    expect(landUseCharge(100_000_000, true, 1)).toBe(76_000);
    expect(landUseCharge(100_000_000, false, heldFraction(0, MINUTES_PER_YEAR / 2))).toBe(128_000);
  });

  it('omonile ask 5-15% of the land (at least ₦250k)', () => {
    for (let i = 0; i < 100; i++) {
      const demand = omonileDemand(20_000_000, rngFor('seed', 'omonile', i));
      expect(demand).toBeGreaterThanOrEqual(1_000_000);
      expect(demand).toBeLessThanOrEqual(3_000_000);
    }
    expect(omonileDemand(1_000_000, rngFor('seed', 'omonile', 1))).toBe(250_000);
  });

  it('owners keep one flat of a block for themselves', () => {
    expect(lettableUnits({ blueprintId: 'block-of-flats', ownerOccupied: false })).toBe(6);
    expect(lettableUnits({ blueprintId: 'block-of-flats', ownerOccupied: true })).toBe(5);
    expect(lettableUnits({ blueprintId: 'bungalow', ownerOccupied: true })).toBe(0);
  });
});
