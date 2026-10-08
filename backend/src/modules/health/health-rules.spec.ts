import {
  ANTENATAL_SCHEDULE_MONTHS,
  CARE_FACILITY_TYPES,
  CONDITIONS,
  CONDITION_IDS,
  CONDITION_SEVERITIES,
  FACILITIES,
  HMO_PLANS,
  HMO_PLAN_IDS,
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  NATURAL_DEATH_MIN_AGE,
  PREGNANCY_MINUTES,
  annualMortalityHazard,
  canTreatAt,
  dailyMortalityChance,
  deliveryComplicationChance,
  diabetesYearlyChance,
  doctorsStrikeAt,
  healthDailyDrift,
  hmoMonthlyPremium,
  hypertensionYearlyChance,
  malariaDailyChance,
  nextAntenatalDue,
  pregnancyTrimester,
  residentDoctorsStrikes,
  severityRank,
  survivalProbability,
  treatmentBasePrice,
  treatmentSuccessChance,
  type ConditionSeverity,
} from '@insidelife/shared';

const inUnitInterval = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;

/** Age at which half of characters holding a constant health level have died of natural causes. */
function medianLifespan(health: number): number {
  for (let age = NATURAL_DEATH_MIN_AGE; age < 120; age++) if (survivalProbability(17, age, health) < 0.5) return age;
  return 120;
}

describe('condition progression tables', () => {
  it.each(CONDITION_IDS)('%s has daily probabilities in [0, 1]', (id) => {
    const condition = CONDITIONS[id];
    for (const severity of CONDITION_SEVERITIES) {
      expect(inUnitInterval(condition.worsenPerDay[severity])).toBe(true);
      expect(inUnitInterval(condition.recoverPerDay[severity])).toBe(true);
      expect(inUnitInterval(condition.worsenPerDay[severity] + condition.recoverPerDay[severity])).toBe(true);
    }
    expect(condition.worsenPerDay.critical).toBe(0);
    expect(condition.contagious).toBe('none');
  });

  it.each(CONDITION_IDS.filter((id) => id !== 'pregnancy'))('%s symptoms get worse with severity', (id) => {
    const condition = CONDITIONS[id];
    for (let rank = 1; rank < CONDITION_SEVERITIES.length; rank++) {
      const milder = condition.symptoms[CONDITION_SEVERITIES[rank - 1] as ConditionSeverity];
      const worse = condition.symptoms[CONDITION_SEVERITIES[rank] as ConditionSeverity];
      expect(worse.energyCap).toBeLessThanOrEqual(milder.energyCap);
      expect(worse.healthPerDay).toBeGreaterThanOrEqual(milder.healthPerDay);
      expect(worse.mood).toBeLessThanOrEqual(milder.mood);
    }
  });

  it('chronic conditions never clear by themselves and have monthly medication', () => {
    for (const id of CONDITION_IDS) {
      const condition = CONDITIONS[id];
      if (!condition.chronic) continue;
      expect(CONDITION_SEVERITIES.every((severity) => condition.recoverPerDay[severity] === 0)).toBe(true);
      expect(condition.monthlyMedication).toBeGreaterThan(0);
      expect(condition.managedSymptoms).toBeDefined();
    }
  });

  it('severe malaria caps energy at 35', () => {
    expect(CONDITIONS.malaria.symptoms.severe.energyCap).toBe(35);
  });

  it('burnout and pregnancy can never be fatal', () => {
    expect(CONDITIONS.burnout.canBeFatal).toBe(false);
    expect(CONDITIONS.pregnancy.canBeFatal).toBe(false);
  });
});

describe('facilities and treatment', () => {
  it('has success odds in [0, 1] that fall with severity and prices that rise', () => {
    for (const facility of CARE_FACILITY_TYPES) {
      const definition = FACILITIES[facility];
      for (let rank = 0; rank < CONDITION_SEVERITIES.length; rank++) {
        const severity = CONDITION_SEVERITIES[rank] as ConditionSeverity;
        expect(inUnitInterval(definition.success[severity])).toBe(true);
        expect(inUnitInterval(definition.fakeDrugRisk)).toBe(true);
        if (rank === 0) continue;
        const previous = CONDITION_SEVERITIES[rank - 1] as ConditionSeverity;
        expect(definition.success[severity]).toBeLessThanOrEqual(definition.success[previous]);
        const price = definition.price[severity];
        const previousPrice = definition.price[previous];
        if (price !== null && previousPrice !== null) expect(price).toBeGreaterThanOrEqual(previousPrice);
      }
    }
  });

  it.each(CONDITION_IDS.filter((id) => id !== 'pregnancy'))('%s: private ≥ public ≥ pharmacy at every severity', (id) => {
    for (const severity of CONDITION_SEVERITIES) {
      for (const diagnosed of [true, false]) {
        const odds = (facility: (typeof CARE_FACILITY_TYPES)[number]): number => treatmentSuccessChance(id, severity, facility, { diagnosed });
        expect(odds('hospital-private')).toBeGreaterThanOrEqual(odds('hospital-public'));
        expect(odds('hospital-public')).toBeGreaterThanOrEqual(odds('pharmacy'));
      }
    }
  });

  it('keeps that ordering for severe cases even during a doctors’ strike', () => {
    for (const id of ['malaria', 'typhoid', 'injury', 'hypertension'] as const) {
      const pharmacy = treatmentSuccessChance(id, 'severe', 'pharmacy', { diagnosed: true });
      const strikePublic = treatmentSuccessChance(id, 'severe', 'hospital-public', { diagnosed: true, strike: true });
      const normalPublic = treatmentSuccessChance(id, 'severe', 'hospital-public', { diagnosed: true });
      const privateCare = treatmentSuccessChance(id, 'severe', 'hospital-private', { diagnosed: true, strike: true });
      expect(privateCare).toBeGreaterThanOrEqual(normalPublic);
      expect(normalPublic).toBeGreaterThan(strikePublic);
      expect(strikePublic).toBeGreaterThanOrEqual(pharmacy);
    }
  });

  it('only lets pharmacies handle what they can, and never emergencies', () => {
    expect(canTreatAt('malaria', 'mild', 'pharmacy').ok).toBe(true);
    expect(canTreatAt('catarrh', 'moderate', 'pharmacy').ok).toBe(true);
    expect(canTreatAt('malaria', 'critical', 'pharmacy').ok).toBe(false);
    expect(canTreatAt('burnout', 'mild', 'pharmacy').ok).toBe(false);
    expect(canTreatAt('pregnancy', 'mild', 'pharmacy').ok).toBe(false);
    expect(canTreatAt('malaria', 'critical', 'hospital-public').ok).toBe(true);
  });

  it('prices self-medication at roughly ₦2k–₦15k (2026 Lagos)', () => {
    for (const id of CONDITION_IDS) {
      for (const severity of CONDITION_SEVERITIES) {
        const price = treatmentBasePrice(id, severity, 'pharmacy');
        if (price === null) continue;
        expect(price).toBeGreaterThanOrEqual(1_500);
        expect(price).toBeLessThanOrEqual(16_000);
      }
    }
  });

  it('prices a mild malaria episode at a general hospital at ₦7k–₦17k', () => {
    const price = treatmentBasePrice('malaria', 'mild', 'hospital-public') ?? 0;
    expect(price).toBeGreaterThanOrEqual(7_000);
    expect(price).toBeLessThanOrEqual(17_000);
  });

  it('prices private C-sections within ₦0.3m–₦1.5m', () => {
    const cSection = FACILITIES['hospital-private'].delivery?.cSection ?? 0;
    expect(cSection).toBeGreaterThanOrEqual(300_000);
    expect(cSection).toBeLessThanOrEqual(1_500_000);
  });
});

describe('HMO plans', () => {
  it('bills a twelfth of the annual premium monthly and covers more as plans get richer', () => {
    let previous: (typeof HMO_PLANS)[keyof typeof HMO_PLANS] | null = null;
    for (const id of HMO_PLAN_IDS) {
      const plan = HMO_PLANS[id];
      expect(hmoMonthlyPremium(id)).toBe(Math.round(plan.annualPremium / 12));
      expect(inUnitInterval(plan.maternity)).toBe(true);
      for (const facility of CARE_FACILITY_TYPES) {
        expect(inUnitInterval(plan.coverage[facility])).toBe(true);
        if (previous) expect(plan.coverage[facility]).toBeGreaterThanOrEqual(previous.coverage[facility]);
      }
      if (previous) {
        expect(plan.annualPremium).toBeGreaterThan(previous.annualPremium);
        expect(plan.annualLimit).toBeGreaterThan(previous.annualLimit);
      }
      previous = plan;
    }
    expect(HMO_PLANS.basic.annualPremium).toBe(45_000);
    expect(HMO_PLANS.executive.annualPremium).toBe(900_000);
  });
});

describe('mortality curve', () => {
  it('never takes a young life by natural causes', () => {
    for (const age of [17, 25, 39]) {
      expect(annualMortalityHazard({ age, health: 5, unmanagedChronic: 2, goodCare: false })).toBe(0);
      expect(dailyMortalityChance({ age, health: 90, unmanagedChronic: 0, goodCare: false })).toBe(0);
    }
  });

  it('is tiny for healthy 40-somethings and meaningful past 80', () => {
    expect(annualMortalityHazard({ age: 45, health: 85, unmanagedChronic: 0, goodCare: false })).toBeLessThan(0.005);
    expect(annualMortalityHazard({ age: 80, health: 60, unmanagedChronic: 0, goodCare: false })).toBeGreaterThan(0.1);
    expect(annualMortalityHazard({ age: 90, health: 50, unmanagedChronic: 0, goodCare: false })).toBeGreaterThan(0.4);
  });

  it('rises with age and falls with health, managed chronic illness and good care', () => {
    const base = { health: 70, unmanagedChronic: 0, goodCare: false };
    expect(annualMortalityHazard({ ...base, age: 70 })).toBeGreaterThan(annualMortalityHazard({ ...base, age: 60 }));
    expect(annualMortalityHazard({ ...base, age: 65, health: 40 })).toBeGreaterThan(annualMortalityHazard({ ...base, age: 65, health: 90 }));
    expect(annualMortalityHazard({ ...base, age: 65, unmanagedChronic: 1 })).toBeGreaterThan(annualMortalityHazard({ ...base, age: 65 }));
    expect(annualMortalityHazard({ ...base, age: 65, goodCare: true })).toBeLessThan(annualMortalityHazard({ ...base, age: 65 }));
  });

  it('gives an average Lagos life a median in the mid-60s to low-70s, longer when healthy', () => {
    const average = medianLifespan(70);
    expect(average).toBeGreaterThanOrEqual(62);
    expect(average).toBeLessThanOrEqual(74);
    expect(medianLifespan(95)).toBeGreaterThan(average + 5);
    expect(medianLifespan(45)).toBeLessThan(average);
    expect(survivalProbability(17, 40, 50)).toBe(1);
  });

  it('turns the annual hazard into a daily chance', () => {
    const daily = dailyMortalityChance({ age: 85, health: 50, unmanagedChronic: 0, goodCare: false });
    expect(daily).toBeGreaterThan(0);
    expect(daily).toBeLessThan(0.01);
  });
});

describe('daily health drift', () => {
  const healthyYoung = {
    health: 85,
    age: 25,
    lifestyleDrift: 0,
    mood: 60,
    fitness: 40,
    conditionDamage: 0,
    lowNeedStreak: 0,
    lowNeeds: 0,
    broke: false,
    hospitalCare: 0,
  };

  it('barely moves for a healthy young adult', () => {
    expect(Math.abs(healthDailyDrift(healthyYoung).total)).toBeLessThan(0.5);
  });

  it('falls with illness, deprivation, poverty and age; rises with fitness and hospital care', () => {
    const base = healthDailyDrift(healthyYoung).total;
    expect(healthDailyDrift({ ...healthyYoung, conditionDamage: 4 }).total).toBeLessThan(base);
    expect(healthDailyDrift({ ...healthyYoung, lowNeedStreak: 4, lowNeeds: 2, broke: true }).total).toBeLessThan(base);
    expect(healthDailyDrift({ ...healthyYoung, lifestyleDrift: -0.4 }).total).toBeLessThan(base);
    expect(healthDailyDrift({ ...healthyYoung, age: 75 }).total).toBeLessThan(base);
    expect(healthDailyDrift({ ...healthyYoung, fitness: 90 }).total).toBeGreaterThan(base);
    expect(healthDailyDrift({ ...healthyYoung, hospitalCare: 2.5 }).total).toBeGreaterThan(base);
  });

  it('heals back toward the body’s set point after an illness', () => {
    expect(healthDailyDrift({ ...healthyYoung, health: 40 }).total).toBeGreaterThan(1);
  });
});

describe('getting sick', () => {
  it('makes malaria a rainy-season, low-comfort disease that nets and fumigation reduce', () => {
    const rainy = malariaDailyChance({ season: 'rainy', comfort: 40, hasNet: false, fumigated: false });
    expect(rainy).toBeGreaterThan(malariaDailyChance({ season: 'harmattan', comfort: 40, hasNet: false, fumigated: false }));
    expect(rainy).toBeGreaterThan(malariaDailyChance({ season: 'rainy', comfort: 88, hasNet: false, fumigated: false }));
    expect(rainy).toBeGreaterThan(malariaDailyChance({ season: 'rainy', comfort: 40, hasNet: true, fumigated: false }));
    expect(rainy).toBeGreaterThan(malariaDailyChance({ season: 'rainy', comfort: 40, hasNet: false, fumigated: true }));
    expect(inUnitInterval(rainy)).toBe(true);
  });

  it('only checks chronic conditions from the right ages', () => {
    const risk = { lifestyle: 'managing', fitness: 40, stress: 0.5 } as const;
    expect(hypertensionYearlyChance({ ...risk, age: 34 })).toBe(0);
    expect(hypertensionYearlyChance({ ...risk, age: 50 })).toBeGreaterThan(hypertensionYearlyChance({ ...risk, age: 36 }));
    expect(diabetesYearlyChance({ ...risk, age: 39 })).toBe(0);
    expect(inUnitInterval(diabetesYearlyChance({ ...risk, age: 70, hasHypertension: true }))).toBe(true);
  });
});

describe('pregnancy timeline', () => {
  const conceivedAt = 1_000 * MINUTES_PER_DAY;

  it('lasts nine game months (270 game days)', () => {
    expect(PREGNANCY_MINUTES).toBe(9 * MINUTES_PER_MONTH);
    expect(PREGNANCY_MINUTES / MINUTES_PER_DAY).toBe(270);
  });

  it('moves through the trimesters every three months', () => {
    expect(pregnancyTrimester(conceivedAt, conceivedAt)).toBe(1);
    expect(pregnancyTrimester(conceivedAt, conceivedAt + 3 * MINUTES_PER_MONTH - 1)).toBe(1);
    expect(pregnancyTrimester(conceivedAt, conceivedAt + 3 * MINUTES_PER_MONTH)).toBe(2);
    expect(pregnancyTrimester(conceivedAt, conceivedAt + 6 * MINUTES_PER_MONTH)).toBe(3);
    expect(pregnancyTrimester(conceivedAt, conceivedAt + PREGNANCY_MINUTES - 1)).toBe(3);
  });

  it('schedules antenatal visits in order, all before the due date', () => {
    const due = ANTENATAL_SCHEDULE_MONTHS.map((_, visits) => nextAntenatalDue(conceivedAt, visits));
    expect(due.every((t) => t !== null && t > conceivedAt && t < conceivedAt + PREGNANCY_MINUTES)).toBe(true);
    for (let index = 1; index < due.length; index++) expect(due[index] ?? 0).toBeGreaterThan(due[index - 1] ?? 0);
    expect(nextAntenatalDue(conceivedAt, ANTENATAL_SCHEDULE_MONTHS.length)).toBeNull();
  });

  it('makes complications rarer with every antenatal visit (but never zero)', () => {
    const chances = [0, 1, 2, 3, 4].map((antenatalVisits) => deliveryComplicationChance({ antenatalVisits, carrierAge: 28, carrierHealth: 80 }));
    for (let index = 1; index < chances.length; index++) expect(chances[index] ?? 1).toBeLessThanOrEqual(chances[index - 1] ?? 0);
    expect(chances.every((chance) => chance > 0 && chance < 0.1)).toBe(true);
    expect(deliveryComplicationChance({ antenatalVisits: 0, carrierAge: 40, carrierHealth: 30 })).toBeGreaterThan(chances[0] ?? 1);
  });
});

describe('resident doctors’ strikes', () => {
  it('is a deterministic world calendar', () => {
    expect(residentDoctorsStrikes('seed-a', 2030)).toEqual(residentDoctorsStrikes('seed-a', 2030));
    for (let year = 2027; year < 2040; year++) {
      for (const strike of residentDoctorsStrikes('seed-a', year)) {
        expect(strike.endsAt).toBeGreaterThan(strike.startsAt);
        expect(doctorsStrikeAt('seed-a', strike.startsAt)).toEqual(strike);
        expect(doctorsStrikeAt('seed-a', strike.endsAt)?.id ?? null).not.toBe(strike.id);
      }
    }
  });
});

describe('severity helpers', () => {
  it('orders severities mild → critical', () => {
    expect(CONDITION_SEVERITIES.map(severityRank)).toEqual([0, 1, 2, 3]);
  });
});
