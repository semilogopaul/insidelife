import { boosted } from '../money/income-multiplier.js';
import { BASE_USD_RATE } from '../world/world.js';
import type { SkillKey } from './life.js';
import type { CityId } from './geography.js';
import { cityOfVenueId } from './venues.js';

/**
 * Careers catalog — owned by the careers domain.
 *
 * ~30 jobs from informal hustles to professional ladders. Pay is calibrated to 2026 Lagos data
 * (docs/research/nigeria-economy-2026.md): monthly gross in naira, or US dollars for remote work (converted at the
 * world parallel rate on payday). Employers are fictional brands; public institutions are real.
 */

// ---------------------------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------------------------

/** Education levels a job can ask for, lowest first (mirrors the education domain's credentials). */
export const CAREER_EDUCATION_LEVELS = ['none', 'ssce', 'nd', 'hnd', 'bachelors', 'masters', 'phd'] as const;
export type CareerEducationLevel = (typeof CAREER_EDUCATION_LEVELS)[number];

export const CAREER_EDUCATION_LABELS: Readonly<Record<CareerEducationLevel, string>> = {
  none: 'No certificate',
  ssce: 'SSCE (WAEC/NECO)',
  nd: 'OND or diploma',
  hnd: 'HND',
  bachelors: 'Bachelor’s degree',
  masters: 'Master’s degree',
  phd: 'PhD',
};

/** University and polytechnic classes of degree. */
export const CAREER_DEGREE_CLASSES = [
  'first',
  'second-upper',
  'second-lower',
  'third',
  'pass',
  'distinction',
  'upper-credit',
  'lower-credit',
] as const;
export type CareerDegreeClass = (typeof CAREER_DEGREE_CLASSES)[number];

/** Comparable rank of a degree class (polytechnic classes map onto the university scale). */
export const CAREER_DEGREE_CLASS_RANK: Readonly<Record<CareerDegreeClass, number>> = {
  first: 5,
  distinction: 5,
  'second-upper': 4,
  'upper-credit': 4,
  'second-lower': 3,
  'lower-credit': 3,
  third: 2,
  pass: 1,
};

export const CAREER_DEGREE_CLASS_LABELS: Readonly<Record<CareerDegreeClass, string>> = {
  first: 'First class',
  'second-upper': 'Second class upper (2:1)',
  'second-lower': 'Second class lower (2:2)',
  third: 'Third class',
  pass: 'Pass',
  distinction: 'Distinction',
  'upper-credit': 'Upper credit',
  'lower-credit': 'Lower credit',
};

/** Professional licences and certificates jobs refer to (granted by the education domain). */
export const JOB_CERTIFICATION_LABELS: Readonly<Record<string, string>> = {
  bar: 'Called to the Nigerian Bar',
  mdcn: 'MDCN full licence',
  nmcn: 'NMCN nursing licence',
  ican: 'ICAN chartered accountant',
  coren: 'COREN registered engineer',
  cloud: 'Cloud certification',
  pmp: 'PMP',
  ielts: 'IELTS',
  'drivers-licence': 'FRSC driver’s licence',
  bootcamp: 'Software engineering bootcamp',
};

export function jobCertificationLabel(id: string): string {
  return JOB_CERTIFICATION_LABELS[id] ?? id.replace(/-/g, ' ').toUpperCase();
}

export const JOB_SECTORS = ['informal', 'entry', 'graduate', 'professional', 'tech', 'creative'] as const;
export type JobSector = (typeof JOB_SECTORS)[number];

export const JOB_SECTOR_LABELS: Readonly<Record<JobSector, string>> = {
  informal: 'Hustle',
  entry: 'Entry-level',
  graduate: 'Graduate',
  professional: 'Professional',
  tech: 'Tech',
  creative: 'Creative',
};

/** `remote` works from home; `roaming` jobs (ride-hailing, okada) report to a motor park and work the streets. */
export const WORK_MODES = ['onsite', 'remote', 'roaming'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const JOB_CURRENCIES = ['NGN', 'USD'] as const;
export type JobCurrency = (typeof JOB_CURRENCIES)[number];

/** Flags career life events key on. */
export const JOB_TRAITS = [
  'office', // formal workplace: oga wants you on Saturday, colleague takes credit, office owambe
  'public-service', // government payroll: salary delays
  'kickback', // money passes through your hands: "something for the boys"
  'headhunt', // recruiters poach good performers
  'health', // doctors and nurses: japa recruiters
  'music', // afrobeats breakout
  'viral', // content breakout
] as const;
export type JobTrait = (typeof JOB_TRAITS)[number];

// ---------------------------------------------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------------------------------------------

export interface JobSchedule {
  /** Working days, 0 = Monday … 6 = Sunday. */
  readonly days: readonly number[];
  /** Shift start (hour of day). Night shifts run past midnight. */
  readonly startHour: number;
  readonly hours: number;
}

/** Every group must be satisfied by owning at least one item carrying one of `anyOf`. */
export interface JobItemRequirement {
  readonly anyOf: readonly string[];
  readonly label: string;
}

export interface JobExperienceRequirement {
  readonly jobIds: readonly string[];
  readonly years: number;
  readonly label: string;
}

export interface JobRequirements {
  readonly minAge?: number;
  /** "Not more than 26 years old" — Nigerian graduate schemes love an age limit. */
  readonly maxAge?: number;
  /** Minimum highest qualification. */
  readonly education?: CareerEducationLevel;
  /** Degree must be in one of these fields (segment match: `engineering` matches `civil-engineering`). */
  readonly fields?: readonly string[];
  /** Minimum class of degree (elite employers). */
  readonly minGrade?: CareerDegreeClass;
  /** Five WAEC credits including Maths and English. */
  readonly waecMathsEnglish?: boolean;
  /** NYSC completed or exempted. */
  readonly nysc?: boolean;
  readonly certifications?: readonly string[];
  readonly items?: readonly JobItemRequirement[];
  readonly skills?: Partial<Record<SkillKey, number>>;
  readonly experience?: JobExperienceRequirement;
}

export interface JobLevelDefinition {
  readonly title: string;
  /** Gross monthly pay in the job's currency. */
  readonly pay: number;
  /** Game years to serve at this level before the next promotion review. */
  readonly minYears: number;
  /** Gates for being promoted INTO this level. */
  readonly skills?: Partial<Record<SkillKey, number>>;
  readonly certifications?: readonly string[];
  /** NYSC needed for this level (doctors go from housemanship to NYSC to medical officer). */
  readonly nysc?: boolean;
  /** Minimum highest qualification to be promoted into this level (set automatically for well-paid levels, see `JOBS`). */
  readonly education?: CareerEducationLevel;
  /** "Man know man": minimum connections (0-100) for this level. */
  readonly minConnections?: number;
  /** Only a breakout life event gets you here (a hit song, a viral skit). */
  readonly breakout?: boolean;
  /** Clout while you hold the title. */
  readonly status: number;
}

export interface JobPerks {
  /** 8% employee + 10% employer contributions into the locked RSA. */
  readonly pension: boolean;
  /** PAYE deducted at source (or self-assessed for remote contracts). */
  readonly paye: boolean;
  readonly hmo: boolean;
  /** Public holidays off (formal jobs). Hustles never close. */
  readonly holidays: boolean;
  /** Paid leave days per game year. */
  readonly leaveDays: number;
}

export interface JobHiring {
  /** 0 (anybody gets in) … 1 (elite): base rejection pressure. */
  readonly selectivity: number;
  /** How much CGPA and school prestige move the needle. */
  readonly academicWeight: number;
  /** How much connections ("man know man") move the needle. */
  readonly connectionWeight: number;
  /** Chance an application goes to an interview stage (a life-event card). */
  readonly interviewChance: number;
}

export interface JobDefinition {
  readonly id: string;
  readonly title: string;
  readonly employer: string;
  readonly industry: string;
  readonly sector: JobSector;
  readonly emoji: string;
  readonly blurb: string;
  /** Venue id the routine commutes to (roaming jobs report to a motor park; remote jobs show their hub). */
  readonly workplaceId: string;
  readonly workMode: WorkMode;
  readonly schedule: JobSchedule;
  readonly currency: JobCurrency;
  readonly requirements: JobRequirements;
  /** Career ladder, entry level first. */
  readonly levels: readonly JobLevelDefinition[];
  readonly perks: JobPerks;
  /** 0-1: drains energy and fun faster at work. */
  readonly stress: number;
  /** Skill XP per worked hour (small: careers are long). */
  readonly skillXpPerHour: Partial<Record<SkillKey, number>>;
  readonly hiring: JobHiring;
  /** Month-to-month pay volatility (log-normal σ) for tips, commission and show money. 0 = fixed salary. */
  readonly payVolatility: number;
  /** Pay multiplier during Detty December (show money, events). */
  readonly dettyDecemberPay?: number;
  /** A licence earned by serving the entry level (housemanship → full MDCN licence). */
  readonly licence?: { readonly certification: string; readonly afterYears: number };
  readonly traits: readonly JobTrait[];
  /**
   * Exempt from the degree rule for well-paid levels (the ₦10m cap still applies). Football, music, content creation, the
   * artisan trades (contractor) and Bolt fleets: talent, hustle and a business, not a certificate, take you to the top.
   */
  readonly degreeExempt?: boolean;
}

// ---------------------------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------------------------

const MON_FRI = [0, 1, 2, 3, 4] as const;
const MON_SAT = [0, 1, 2, 3, 4, 5] as const;

const HUSTLE: JobPerks = { pension: false, paye: false, hmo: false, holidays: false, leaveDays: 6 };
const FORMAL: JobPerks = { pension: true, paye: true, hmo: true, holidays: true, leaveDays: 20 };
const SELF_EMPLOYED: JobPerks = { pension: false, paye: false, hmo: false, holidays: false, leaveDays: 10 };

const OPEN_DOOR: JobHiring = { selectivity: 0.12, academicWeight: 0, connectionWeight: 0.08, interviewChance: 0 };

const job = (definition: JobDefinition): JobDefinition => definition;

// ---------------------------------------------------------------------------------------------------------------
// The jobs
// ---------------------------------------------------------------------------------------------------------------

/** Pay as in real Lagos; `JOBS` (below) is what the game pays: × INCOME_MULTIPLIER. */
const LAGOS_JOBS: readonly JobDefinition[] = [
  // --- Hustles: no certificate needed ---------------------------------------------------------------------------
  job({
    id: 'pos-attendant',
    title: 'POS attendant',
    employer: 'Kudi Corner POS',
    industry: 'Agency banking',
    sector: 'informal',
    emoji: '💳',
    blurb: 'Withdrawals, transfers and “network is bad, come back”. You touch more cash than a bank teller.',
    workplaceId: 'mushin-market',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 8, hours: 10 },
    currency: 'NGN',
    requirements: {},
    levels: [
      { title: 'POS attendant', pay: 85_000, minYears: 0.5, status: 3 },
      { title: 'Senior POS attendant', pay: 115_000, minYears: 1, skills: { hustle: 25 }, status: 6 },
      { title: 'Kiosk supervisor', pay: 165_000, minYears: 0, skills: { hustle: 40, finance: 15 }, status: 10 },
    ],
    perks: HUSTLE,
    stress: 0.35,
    skillXpPerHour: { hustle: 0.009, finance: 0.002, charisma: 0.001 },
    hiring: OPEN_DOOR,
    payVolatility: 0.12,
    traits: ['kickback'],
  }),
  job({
    id: 'balogun-sales',
    title: 'Sales girl / sales boy',
    employer: 'Mama Chidinma Fabrics, Balogun',
    industry: 'Market trade',
    sector: 'informal',
    emoji: '🧵',
    blurb: 'Call customers, haggle like a pro, carry bales. Commission on a good day.',
    workplaceId: 'balogun-market',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 8, hours: 10 },
    currency: 'NGN',
    requirements: {},
    levels: [
      { title: 'Sales girl / sales boy', pay: 65_000, minYears: 1, status: 3 },
      { title: 'Senior sales', pay: 95_000, minYears: 1.5, skills: { charisma: 20, hustle: 25 }, status: 6 },
      { title: 'Shop manager', pay: 150_000, minYears: 0, skills: { charisma: 35, business: 20 }, status: 12 },
    ],
    perks: HUSTLE,
    stress: 0.4,
    skillXpPerHour: { charisma: 0.005, hustle: 0.007, business: 0.0015 },
    hiring: OPEN_DOOR,
    payVolatility: 0.2,
    dettyDecemberPay: 1.3,
    traits: [],
  }),
  job({
    id: 'danfo-conductor',
    title: 'Danfo conductor',
    employer: 'Alhaji Lateef Transport',
    industry: 'Transport',
    sector: 'informal',
    emoji: '🚌',
    blurb: '“Oshodi! Oshodi! Enter with your change!” Long days, loud days, cash days.',
    workplaceId: 'ikorodu-garage',
    workMode: 'roaming',
    schedule: { days: MON_SAT, startHour: 5, hours: 12 },
    currency: 'NGN',
    requirements: {},
    levels: [
      { title: 'Danfo conductor', pay: 110_000, minYears: 1, status: 2 },
      { title: 'Danfo driver', pay: 185_000, minYears: 1.5, certifications: ['drivers-licence'], skills: { hustle: 30 }, status: 6 },
      { title: 'Park manager', pay: 300_000, minYears: 0, skills: { hustle: 50, charisma: 30 }, minConnections: 30, status: 20 },
    ],
    perks: HUSTLE,
    stress: 0.55,
    skillXpPerHour: { hustle: 0.01, fitness: 0.002, charisma: 0.001 },
    hiring: OPEN_DOOR,
    payVolatility: 0.15,
    traits: [],
  }),
  job({
    id: 'security-guard',
    title: 'Security guard',
    employer: 'Ironclad Guards Ltd',
    industry: 'Security',
    sector: 'informal',
    emoji: '💂',
    blurb: 'Night shifts at Lekki Circle Mall. Keep your eyes open and your torchlight charged.',
    workplaceId: 'lekki-mall',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 19, hours: 11 },
    currency: 'NGN',
    requirements: { minAge: 18 },
    levels: [
      { title: 'Security guard', pay: 75_000, minYears: 1, status: 2 },
      { title: 'Shift supervisor', pay: 105_000, minYears: 1.5, skills: { fitness: 40 }, status: 5 },
      { title: 'Site supervisor', pay: 150_000, minYears: 0, skills: { charisma: 25, hustle: 30 }, status: 10 },
    ],
    perks: HUSTLE,
    stress: 0.3,
    skillXpPerHour: { fitness: 0.004, hustle: 0.005 },
    hiring: OPEN_DOOR,
    payVolatility: 0,
    traits: [],
  }),
  job({
    id: 'buka-assistant',
    title: 'Buka assistant',
    employer: 'Shitta Amala Joint',
    industry: 'Food service',
    sector: 'informal',
    emoji: '🥘',
    blurb: 'Turn amala, serve gbegiri, wash plates. Free lunch, hot kitchen.',
    workplaceId: 'shitta-amala',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 7, hours: 11 },
    currency: 'NGN',
    requirements: {},
    levels: [
      { title: 'Buka assistant', pay: 55_000, minYears: 0.75, status: 2 },
      { title: 'Cook', pay: 85_000, minYears: 1, skills: { cooking: 30 }, status: 5 },
      { title: 'Head cook', pay: 130_000, minYears: 1.5, skills: { cooking: 50 }, status: 9 },
      { title: 'Kitchen manager', pay: 185_000, minYears: 0, skills: { cooking: 60, business: 25 }, status: 14 },
    ],
    perks: HUSTLE,
    stress: 0.45,
    skillXpPerHour: { cooking: 0.008, hustle: 0.004 },
    hiring: OPEN_DOOR,
    payVolatility: 0.08,
    traits: [],
  }),
  job({
    id: 'artisan',
    title: 'Electrician (apprenticeship)',
    employer: 'Oga Kunle Electricals',
    industry: 'Artisan trades',
    sector: 'informal',
    emoji: '🔧',
    blurb: 'Start as an apprentice carrying the toolbox; finish as the master everybody calls when NEPA misbehaves.',
    workplaceId: 'mushin-market',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 8, hours: 9 },
    currency: 'NGN',
    requirements: {},
    levels: [
      { title: 'Apprentice', pay: 40_000, minYears: 1.5, status: 2 },
      { title: 'Artisan', pay: 220_000, minYears: 2, skills: { trade: 30 }, status: 8 },
      { title: 'Master artisan', pay: 380_000, minYears: 3, skills: { trade: 55, hustle: 30 }, status: 16 },
      { title: 'Contractor', pay: 620_000, minYears: 0, skills: { trade: 70, business: 30 }, minConnections: 20, status: 28 },
    ],
    perks: HUSTLE,
    stress: 0.4,
    skillXpPerHour: { trade: 0.009, hustle: 0.004, engineering: 0.001 },
    hiring: OPEN_DOOR,
    payVolatility: 0.25,
    traits: [],
    degreeExempt: true,
  }),
  job({
    id: 'hair-stylist',
    title: 'Hair stylist',
    employer: 'Sabo Cuts & Braids',
    industry: 'Beauty',
    sector: 'informal',
    emoji: '💇',
    blurb: 'Knotless braids, fades and gist. Customers tip when you make them feel like Tiwa Savage.',
    workplaceId: 'yaba-salon',
    workMode: 'onsite',
    schedule: { days: [1, 2, 3, 4, 5, 6], startHour: 9, hours: 10 },
    currency: 'NGN',
    requirements: { skills: { trade: 15 } },
    levels: [
      { title: 'Junior stylist', pay: 60_000, minYears: 1, status: 4 },
      { title: 'Stylist', pay: 110_000, minYears: 1.5, skills: { trade: 35, creative: 20 }, status: 8 },
      { title: 'Senior stylist', pay: 165_000, minYears: 2, skills: { trade: 50 }, status: 12 },
      { title: 'Salon manager', pay: 230_000, minYears: 0, skills: { business: 25, charisma: 30 }, status: 18 },
    ],
    perks: HUSTLE,
    stress: 0.35,
    skillXpPerHour: { trade: 0.005, creative: 0.002, charisma: 0.002 },
    hiring: { ...OPEN_DOOR, selectivity: 0.25 },
    payVolatility: 0.25,
    dettyDecemberPay: 1.35,
    traits: [],
  }),
  job({
    id: 'bolt-driver',
    title: 'Ride-hailing driver',
    employer: 'Bolt & Uber (driver-partner)',
    industry: 'Transport',
    sector: 'informal',
    emoji: '🚗',
    blurb: 'Your car, the app, Lagos traffic. Surge pricing in the rain is your best friend.',
    workplaceId: 'cms-motor-park',
    workMode: 'roaming',
    schedule: { days: MON_SAT, startHour: 6, hours: 10 },
    currency: 'NGN',
    requirements: {
      minAge: 18,
      certifications: ['drivers-licence'],
      items: [{ anyOf: ['car'], label: 'Your own car' }],
    },
    levels: [
      { title: 'Driver-partner', pay: 190_000, minYears: 1, status: 6 },
      { title: '4.9★ driver', pay: 280_000, minYears: 1.5, skills: { hustle: 30, charisma: 20 }, status: 10 },
      { title: 'Fleet owner-driver', pay: 420_000, minYears: 0, skills: { business: 25, hustle: 45 }, status: 18 },
    ],
    perks: HUSTLE,
    stress: 0.5,
    skillXpPerHour: { hustle: 0.008, charisma: 0.003 },
    hiring: { ...OPEN_DOOR, selectivity: 0.1 },
    payVolatility: 0.25,
    traits: [],
    degreeExempt: true,
  }),
  job({
    id: 'okada-rider',
    title: 'Okada rider',
    employer: 'Alhaji Musa Bikes (hire purchase)',
    industry: 'Transport',
    sector: 'informal',
    emoji: '🏍️',
    blurb: 'Fastest way through Ikorodu traffic. Mind the task force and wear your helmet.',
    workplaceId: 'ikorodu-garage',
    workMode: 'roaming',
    schedule: { days: MON_SAT, startHour: 6, hours: 11 },
    currency: 'NGN',
    requirements: { minAge: 18 },
    levels: [
      { title: 'Okada rider (hire purchase)', pay: 150_000, minYears: 1, status: 2 },
      { title: 'Okada owner-rider', pay: 230_000, minYears: 0, skills: { hustle: 35 }, status: 5 },
    ],
    perks: HUSTLE,
    stress: 0.6,
    skillXpPerHour: { hustle: 0.01, fitness: 0.001 },
    hiring: OPEN_DOOR,
    payVolatility: 0.3,
    traits: [],
  }),
  job({
    id: 'phone-technician',
    title: 'Phone repair technician',
    employer: 'Otigba Street Gadget Clinic',
    industry: 'Electronics',
    sector: 'informal',
    emoji: '📱',
    blurb: 'Screens, charging ports and “e don enter water”. Computer Village trains you fast.',
    workplaceId: 'computer-village',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 8, hours: 10 },
    currency: 'NGN',
    requirements: {},
    levels: [
      { title: 'Apprentice technician', pay: 50_000, minYears: 1, status: 2 },
      { title: 'Technician', pay: 140_000, minYears: 1.5, skills: { tech: 25, trade: 20 }, status: 6 },
      { title: 'Senior technician', pay: 240_000, minYears: 2, skills: { tech: 40, trade: 35 }, status: 10 },
      { title: 'Stall owner', pay: 380_000, minYears: 0, skills: { business: 30, hustle: 40 }, status: 16 },
    ],
    perks: HUSTLE,
    stress: 0.35,
    skillXpPerHour: { trade: 0.007, tech: 0.004, hustle: 0.004 },
    hiring: OPEN_DOOR,
    payVolatility: 0.2,
    traits: [],
  }),
  job({
    id: 'event-usher',
    title: 'Event usher',
    employer: 'Glitz Ushering Agency',
    industry: 'Events',
    sector: 'informal',
    emoji: '🎀',
    blurb: 'Weekend owambes at Landmark Event Centre: matching outfits, small chops and big tips. Fits around school.',
    workplaceId: 'landmark-event-centre',
    workMode: 'onsite',
    schedule: { days: [4, 5, 6], startHour: 14, hours: 9 },
    currency: 'NGN',
    requirements: {},
    levels: [
      { title: 'Usher', pay: 45_000, minYears: 0.75, status: 3 },
      { title: 'Lead usher', pay: 70_000, minYears: 1, skills: { charisma: 25 }, status: 6 },
      { title: 'Event coordinator', pay: 125_000, minYears: 0, skills: { charisma: 40, business: 20 }, status: 12 },
    ],
    perks: HUSTLE,
    stress: 0.3,
    skillXpPerHour: { charisma: 0.006, business: 0.0015 },
    hiring: { ...OPEN_DOOR, selectivity: 0.2 },
    payVolatility: 0.3,
    dettyDecemberPay: 1.7,
    traits: [],
  }),

  // --- Entry-level formal --------------------------------------------------------------------------------------
  job({
    id: 'call-centre-agent',
    title: 'Customer care agent',
    employer: 'Paystream Contact Centre',
    industry: 'Fintech',
    sector: 'entry',
    emoji: '🎧',
    blurb: '“Thank you for calling Paystream, my name is…” Headset, KPIs and very angry customers.',
    workplaceId: 'yaba-hub',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 8, hours: 9 },
    currency: 'NGN',
    requirements: { minAge: 18, education: 'ssce', waecMathsEnglish: true },
    levels: [
      { title: 'Customer care agent', pay: 140_000, minYears: 1, status: 8 },
      { title: 'Senior agent', pay: 190_000, minYears: 1.5, skills: { charisma: 25 }, status: 12 },
      { title: 'Team lead', pay: 290_000, minYears: 2, skills: { charisma: 35, business: 15 }, status: 18 },
      { title: 'Operations supervisor', pay: 430_000, minYears: 0, skills: { business: 30, charisma: 40 }, status: 26 },
    ],
    perks: { ...FORMAL, leaveDays: 15 },
    stress: 0.5,
    skillXpPerHour: { charisma: 0.003, tech: 0.0015 },
    hiring: { selectivity: 0.35, academicWeight: 0.05, connectionWeight: 0.1, interviewChance: 0.4 },
    payVolatility: 0,
    traits: ['office'],
  }),
  job({
    id: 'bank-contract-staff',
    title: 'Bank contract staff (teller)',
    employer: 'Eko Trust Bank (via Hallmark Outsourcing)',
    industry: 'Banking',
    sector: 'entry',
    emoji: '🏧',
    blurb: 'Same banking hall, same targets, half the pay of the “real” staff. A foot in the door.',
    workplaceId: 'marina',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 7, hours: 10 },
    currency: 'NGN',
    requirements: { minAge: 18, education: 'nd', waecMathsEnglish: true },
    levels: [
      { title: 'Contract teller', pay: 130_000, minYears: 1, status: 10 },
      { title: 'Senior teller', pay: 175_000, minYears: 1.5, skills: { finance: 20 }, status: 14 },
      { title: 'Customer service lead', pay: 240_000, minYears: 0, skills: { finance: 30, charisma: 25 }, status: 20 },
    ],
    perks: { ...FORMAL, leaveDays: 15 },
    stress: 0.55,
    skillXpPerHour: { finance: 0.004, charisma: 0.0015 },
    hiring: { selectivity: 0.45, academicWeight: 0.1, connectionWeight: 0.2, interviewChance: 0.5 },
    payVolatility: 0,
    traits: ['office', 'kickback'],
  }),
  job({
    id: 'supermarket-cashier',
    title: 'Supermarket cashier',
    employer: 'Eko Fresh Supermarket',
    industry: 'Retail',
    sector: 'entry',
    emoji: '🛒',
    blurb: 'Scan, bag, smile. Weekend rush at Lekki Circle Mall is no joke.',
    workplaceId: 'lekki-mall',
    workMode: 'onsite',
    schedule: { days: [1, 2, 3, 4, 5, 6], startHour: 9, hours: 9 },
    currency: 'NGN',
    requirements: { minAge: 17, education: 'ssce' },
    levels: [
      { title: 'Cashier', pay: 90_000, minYears: 1, status: 5 },
      { title: 'Floor supervisor', pay: 145_000, minYears: 2, skills: { business: 15, charisma: 25 }, status: 10 },
      { title: 'Store manager', pay: 290_000, minYears: 0, skills: { business: 35, charisma: 35 }, status: 20 },
    ],
    perks: { ...FORMAL, hmo: false, holidays: false, leaveDays: 12 },
    stress: 0.4,
    skillXpPerHour: { business: 0.002, charisma: 0.002 },
    hiring: { selectivity: 0.25, academicWeight: 0, connectionWeight: 0.1, interviewChance: 0.2 },
    payVolatility: 0,
    traits: ['office'],
  }),

  // --- Graduate ladders ----------------------------------------------------------------------------------------
  job({
    id: 'bank-graduate-trainee',
    title: 'Banker (graduate trainee scheme)',
    employer: 'Eko Trust Bank',
    industry: 'Banking',
    sector: 'graduate',
    emoji: '🏦',
    blurb: 'Six weeks of bootcamp, then targets, 7 a.m. resumption and a shot at the boardroom.',
    workplaceId: 'marina',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 7, hours: 11 },
    currency: 'NGN',
    requirements: { minAge: 20, maxAge: 27, education: 'bachelors', minGrade: 'second-lower', nysc: true, waecMathsEnglish: true },
    levels: [
      { title: 'Graduate trainee', pay: 280_000, minYears: 1, status: 25 },
      { title: 'Banking officer', pay: 420_000, minYears: 2, skills: { finance: 30 }, status: 35 },
      { title: 'Senior banking officer', pay: 650_000, minYears: 2, skills: { finance: 40, charisma: 25 }, status: 50 },
      { title: 'Relationship manager', pay: 1_200_000, minYears: 3, skills: { finance: 50, business: 30 }, status: 80 },
      { title: 'Senior manager', pay: 2_000_000, minYears: 3, skills: { finance: 60, business: 40 }, status: 120 },
      { title: 'General manager', pay: 4_000_000, minYears: 4, skills: { finance: 70, business: 55, charisma: 45 }, minConnections: 40, status: 200 },
      { title: 'Executive director', pay: 8_000_000, minYears: 0, skills: { finance: 80, business: 65 }, minConnections: 60, status: 320 },
    ],
    perks: FORMAL,
    stress: 0.7,
    skillXpPerHour: { finance: 0.005, business: 0.002, charisma: 0.0015 },
    hiring: { selectivity: 0.7, academicWeight: 0.35, connectionWeight: 0.25, interviewChance: 0.7 },
    payVolatility: 0,
    traits: ['office', 'headhunt', 'kickback'],
  }),
  job({
    id: 'audit-associate',
    title: 'Auditor (Big-4 style firm)',
    employer: 'Adeyemi Coopers',
    industry: 'Professional services',
    sector: 'graduate',
    emoji: '📊',
    blurb: 'Busy season means 11 p.m. in the office. ICAN or you stall at assistant manager.',
    workplaceId: 'eko-atlantic',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 8, hours: 11 },
    currency: 'NGN',
    requirements: { minAge: 20, education: 'bachelors', minGrade: 'second-upper', nysc: true, waecMathsEnglish: true },
    levels: [
      { title: 'Audit associate', pay: 480_000, minYears: 1, status: 30 },
      { title: 'Senior associate', pay: 750_000, minYears: 2, skills: { finance: 35 }, status: 45 },
      { title: 'Assistant manager', pay: 1_000_000, minYears: 2, skills: { finance: 45 }, status: 60 },
      { title: 'Manager', pay: 1_600_000, minYears: 3, skills: { finance: 55 }, certifications: ['ican'], status: 90 },
      { title: 'Senior manager', pay: 2_500_000, minYears: 3, skills: { finance: 65, business: 40 }, certifications: ['ican'], status: 130 },
      { title: 'Director', pay: 4_200_000, minYears: 4, skills: { finance: 72, business: 55, charisma: 40 }, minConnections: 35, status: 190 },
      { title: 'Partner', pay: 8_500_000, minYears: 0, skills: { finance: 80, business: 65, charisma: 50 }, minConnections: 50, status: 300 },
    ],
    perks: FORMAL,
    stress: 0.75,
    skillXpPerHour: { finance: 0.006, business: 0.0015, intellect: 0.001 },
    hiring: { selectivity: 0.75, academicWeight: 0.45, connectionWeight: 0.15, interviewChance: 0.8 },
    payVolatility: 0,
    traits: ['office', 'headhunt'],
  }),
  job({
    id: 'fmcg-marketing',
    title: 'Brand marketer (FMCG)',
    employer: 'Eko Foods PLC',
    industry: 'FMCG',
    sector: 'graduate',
    emoji: '🍜',
    blurb: 'Noodles, seasoning cubes and market storms in Onitsha. Brand managers drive the nicest pool cars.',
    workplaceId: 'marina',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 8, hours: 9 },
    currency: 'NGN',
    requirements: { minAge: 20, education: 'bachelors', minGrade: 'second-lower', nysc: true },
    levels: [
      { title: 'Management trainee', pay: 350_000, minYears: 1, status: 25 },
      { title: 'Brand assistant', pay: 520_000, minYears: 2, skills: { business: 25, creative: 20 }, status: 35 },
      { title: 'Assistant brand manager', pay: 780_000, minYears: 2, skills: { business: 35, creative: 30, charisma: 25 }, status: 50 },
      { title: 'Brand manager', pay: 1_250_000, minYears: 3, skills: { business: 45, creative: 40 }, status: 80 },
      { title: 'Senior brand manager', pay: 2_100_000, minYears: 3, skills: { business: 55, charisma: 40 }, status: 120 },
      { title: 'Marketing director', pay: 4_500_000, minYears: 0, skills: { business: 68, creative: 50, charisma: 50 }, minConnections: 40, status: 210 },
    ],
    perks: FORMAL,
    stress: 0.6,
    skillXpPerHour: { business: 0.004, creative: 0.0025, charisma: 0.002 },
    hiring: { selectivity: 0.65, academicWeight: 0.3, connectionWeight: 0.2, interviewChance: 0.7 },
    payVolatility: 0,
    traits: ['office', 'headhunt'],
  }),
  job({
    id: 'civil-service',
    title: 'Civil servant (administrative cadre)',
    employer: 'Lagos State Civil Service',
    industry: 'Public service',
    sector: 'graduate',
    emoji: '🏛️',
    blurb: 'Files, memos and “oga is not on seat”. Job for life — if you know somebody to get in.',
    workplaceId: 'alausa-secretariat',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 8, hours: 8 },
    currency: 'NGN',
    requirements: { minAge: 18, maxAge: 35, education: 'hnd', nysc: true },
    levels: [
      { title: 'Administrative Officer II (GL 08)', pay: 190_000, minYears: 2, status: 20 },
      { title: 'Administrative Officer I (GL 09)', pay: 260_000, minYears: 2, status: 28 },
      { title: 'Senior Administrative Officer (GL 12)', pay: 380_000, minYears: 3, skills: { charisma: 25 }, minConnections: 15, status: 40 },
      { title: 'Principal Administrative Officer (GL 14)', pay: 540_000, minYears: 3, minConnections: 25, status: 60 },
      { title: 'Assistant Director (GL 15)', pay: 700_000, minYears: 3, skills: { business: 30 }, minConnections: 35, status: 85 },
      { title: 'Director (GL 17)', pay: 980_000, minYears: 4, skills: { business: 40, charisma: 40 }, minConnections: 50, status: 130 },
      { title: 'Permanent Secretary', pay: 1_500_000, minYears: 0, skills: { charisma: 55 }, minConnections: 70, status: 260 },
    ],
    perks: { ...FORMAL, leaveDays: 21 },
    stress: 0.3,
    skillXpPerHour: { business: 0.0015, charisma: 0.0015, intellect: 0.001 },
    hiring: { selectivity: 0.8, academicWeight: 0.15, connectionWeight: 0.55, interviewChance: 0.4 },
    payVolatility: 0,
    traits: ['office', 'public-service', 'kickback'],
  }),
  job({
    id: 'teacher',
    title: 'Teacher',
    employer: 'Adeniran Memorial Schools',
    industry: 'Education',
    sector: 'graduate',
    emoji: '🍎',
    blurb: 'Chalk, lesson notes and children who know more TikTok dances than you. Long holidays, though.',
    workplaceId: 'surulere-school',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 7, hours: 8 },
    currency: 'NGN',
    requirements: { minAge: 18, education: 'nd' },
    levels: [
      { title: 'Class teacher', pay: 120_000, minYears: 1, status: 12 },
      { title: 'Senior teacher', pay: 170_000, minYears: 2, skills: { intellect: 40, charisma: 25 }, status: 18 },
      { title: 'Head of department', pay: 240_000, minYears: 3, skills: { intellect: 50, charisma: 35 }, status: 26 },
      { title: 'Vice principal', pay: 330_000, minYears: 3, skills: { business: 25, charisma: 45 }, status: 36 },
      { title: 'Principal', pay: 480_000, minYears: 0, skills: { business: 35, charisma: 55 }, status: 50 },
    ],
    perks: { ...FORMAL, hmo: false, leaveDays: 30 },
    stress: 0.45,
    skillXpPerHour: { charisma: 0.003, intellect: 0.002 },
    hiring: { selectivity: 0.35, academicWeight: 0.2, connectionWeight: 0.15, interviewChance: 0.5 },
    payVolatility: 0,
    traits: ['office'],
  }),
  job({
    id: 'journalist-oap',
    title: 'Journalist / OAP',
    employer: 'Lagos Talk FM 99.9',
    industry: 'Media',
    sector: 'graduate',
    emoji: '🎙️',
    blurb: 'Morning drive show, traffic updates and celebrity interviews. Your voice becomes your brand.',
    workplaceId: 'marina',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 6, hours: 8 },
    currency: 'NGN',
    requirements: { minAge: 18, education: 'nd' },
    levels: [
      { title: 'Reporter', pay: 120_000, minYears: 1, status: 15 },
      { title: 'On-air personality', pay: 220_000, minYears: 2, skills: { charisma: 35, creative: 25 }, status: 40 },
      { title: 'Senior OAP', pay: 380_000, minYears: 2, skills: { charisma: 50, creative: 35 }, status: 70 },
      { title: 'Head of programmes', pay: 650_000, minYears: 3, skills: { business: 30, charisma: 55 }, status: 100 },
      { title: 'Station manager', pay: 1_100_000, minYears: 0, skills: { business: 45, charisma: 60 }, minConnections: 30, status: 140 },
    ],
    perks: { ...FORMAL, holidays: false, leaveDays: 15 },
    stress: 0.5,
    skillXpPerHour: { charisma: 0.004, creative: 0.0025 },
    hiring: { selectivity: 0.55, academicWeight: 0.1, connectionWeight: 0.3, interviewChance: 0.7 },
    payVolatility: 0,
    traits: ['office', 'headhunt'],
  }),

  // --- Professionals -------------------------------------------------------------------------------------------
  job({
    id: 'doctor-luth',
    title: 'Doctor (LUTH residency track)',
    employer: 'Lagos University Teaching Hospital',
    industry: 'Healthcare',
    sector: 'professional',
    emoji: '🩺',
    blurb: 'Housemanship first: one brutal year that earns your full MDCN licence. Then residency, then consultant.',
    workplaceId: 'luth',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 8, hours: 10 },
    currency: 'NGN',
    requirements: { minAge: 21, education: 'bachelors', fields: ['medicine'] },
    levels: [
      { title: 'House officer', pay: 214_000, minYears: 1, status: 40 },
      { title: 'Medical officer', pay: 275_000, minYears: 2, certifications: ['mdcn'], nysc: true, status: 60 },
      { title: 'Registrar', pay: 380_000, minYears: 2, skills: { medicine: 45 }, certifications: ['mdcn'], status: 80 },
      { title: 'Senior registrar', pay: 520_000, minYears: 3, skills: { medicine: 60 }, status: 110 },
      { title: 'Consultant', pay: 1_100_000, minYears: 0, skills: { medicine: 75 }, status: 200 },
    ],
    perks: { ...FORMAL, holidays: false, leaveDays: 21 },
    stress: 0.8,
    skillXpPerHour: { medicine: 0.006, intellect: 0.001 },
    hiring: { selectivity: 0.45, academicWeight: 0.3, connectionWeight: 0.2, interviewChance: 0.3 },
    payVolatility: 0,
    licence: { certification: 'mdcn', afterYears: 1 },
    traits: ['health', 'office'],
  }),
  job({
    id: 'doctor-private',
    title: 'Doctor (private hospital)',
    employer: 'Island Specialist Hospital',
    industry: 'Healthcare',
    sector: 'professional',
    emoji: '🏥',
    blurb: 'Air-conditioned wards, rich patients and better pay. They want licensed doctors with experience.',
    workplaceId: 'island-specialist',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 8, hours: 10 },
    currency: 'NGN',
    requirements: {
      minAge: 22,
      education: 'bachelors',
      fields: ['medicine'],
      certifications: ['mdcn'],
      nysc: true,
      experience: { jobIds: ['doctor-luth'], years: 1, label: '1 year of hospital experience (housemanship counts)' },
    },
    levels: [
      { title: 'Medical officer', pay: 450_000, minYears: 2, status: 60 },
      { title: 'Senior medical officer', pay: 700_000, minYears: 2, skills: { medicine: 50 }, status: 85 },
      { title: 'Specialist', pay: 1_500_000, minYears: 3, skills: { medicine: 65 }, status: 140 },
      { title: 'Consultant', pay: 2_800_000, minYears: 4, skills: { medicine: 78 }, minConnections: 25, status: 220 },
      { title: 'Medical director', pay: 4_500_000, minYears: 0, skills: { medicine: 80, business: 45 }, minConnections: 40, status: 280 },
    ],
    perks: { ...FORMAL, holidays: false },
    stress: 0.7,
    skillXpPerHour: { medicine: 0.006, charisma: 0.001 },
    hiring: { selectivity: 0.6, academicWeight: 0.25, connectionWeight: 0.3, interviewChance: 0.6 },
    payVolatility: 0,
    traits: ['health', 'office', 'headhunt'],
  }),
  job({
    id: 'nurse',
    title: 'Nurse',
    employer: 'Lagos State University Teaching Hospital (LASUTH)',
    industry: 'Healthcare',
    sector: 'professional',
    emoji: '👩🏾‍⚕️',
    blurb: 'Ward rounds, night calls and the patients who only trust you. UK recruiters are always watching.',
    workplaceId: 'lasuth',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 7, hours: 8 },
    currency: 'NGN',
    requirements: { minAge: 19, education: 'nd', fields: ['nursing'], certifications: ['nmcn'] },
    levels: [
      { title: 'Nursing officer II', pay: 180_000, minYears: 1, status: 20 },
      { title: 'Nursing officer I', pay: 230_000, minYears: 2, skills: { medicine: 30 }, status: 28 },
      { title: 'Senior nursing officer', pay: 300_000, minYears: 3, skills: { medicine: 40 }, status: 38 },
      { title: 'Principal nursing officer', pay: 380_000, minYears: 3, skills: { medicine: 50 }, status: 50 },
      { title: 'Chief nursing officer', pay: 480_000, minYears: 3, skills: { medicine: 58, business: 20 }, status: 65 },
      { title: 'Director of nursing', pay: 650_000, minYears: 0, skills: { medicine: 65, business: 35 }, minConnections: 25, status: 90 },
    ],
    perks: { ...FORMAL, holidays: false, leaveDays: 21 },
    stress: 0.7,
    skillXpPerHour: { medicine: 0.005, charisma: 0.001 },
    hiring: { selectivity: 0.4, academicWeight: 0.15, connectionWeight: 0.2, interviewChance: 0.4 },
    payVolatility: 0,
    traits: ['health', 'office'],
  }),
  job({
    id: 'lawyer',
    title: 'Lawyer',
    employer: 'Olaniyan & Partners (Marina chambers)',
    industry: 'Law',
    sector: 'professional',
    emoji: '⚖️',
    blurb: 'Court at 9, briefs till midnight. Junior pay is painful; silk (SAN) is the dream.',
    workplaceId: 'marina',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 8, hours: 10 },
    currency: 'NGN',
    requirements: { minAge: 21, education: 'bachelors', fields: ['law'], certifications: ['bar'], nysc: true },
    levels: [
      { title: 'Junior associate', pay: 150_000, minYears: 1, status: 30 },
      { title: 'Associate', pay: 320_000, minYears: 2, skills: { law: 35 }, status: 45 },
      { title: 'Senior associate', pay: 650_000, minYears: 3, skills: { law: 50, charisma: 30 }, status: 70 },
      { title: 'Partner', pay: 1_800_000, minYears: 4, skills: { law: 62, business: 35 }, minConnections: 30, status: 130 },
      { title: 'Senior partner', pay: 3_500_000, minYears: 4, skills: { law: 72, charisma: 50 }, minConnections: 45, status: 200 },
      { title: 'Senior Advocate of Nigeria (SAN)', pay: 7_000_000, minYears: 0, skills: { law: 82, charisma: 60 }, minConnections: 60, status: 380 },
    ],
    perks: FORMAL,
    stress: 0.7,
    skillXpPerHour: { law: 0.006, charisma: 0.0015, intellect: 0.001 },
    hiring: { selectivity: 0.5, academicWeight: 0.3, connectionWeight: 0.3, interviewChance: 0.6 },
    payVolatility: 0,
    traits: ['office', 'headhunt'],
  }),
  job({
    id: 'oil-gas-engineer',
    title: 'Petroleum engineer',
    employer: 'Lagoon Petroleum',
    industry: 'Oil & gas',
    sector: 'professional',
    emoji: '🛢️',
    blurb: 'Offshore rotations, dollar-linked allowances and the best pay a Nigerian graduate can get at home.',
    workplaceId: 'eko-atlantic',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 7, hours: 10 },
    currency: 'NGN',
    requirements: {
      minAge: 21,
      education: 'bachelors',
      fields: ['engineering', 'geology', 'chemistry', 'physics'],
      minGrade: 'second-upper',
      nysc: true,
    },
    levels: [
      { title: 'Graduate engineer', pay: 650_000, minYears: 1, status: 50 },
      { title: 'Engineer II', pay: 950_000, minYears: 2, skills: { engineering: 40 }, status: 65 },
      { title: 'Engineer I', pay: 1_400_000, minYears: 2, skills: { engineering: 50 }, status: 85 },
      { title: 'Senior engineer', pay: 2_200_000, minYears: 3, skills: { engineering: 60 }, status: 120 },
      { title: 'Lead engineer', pay: 3_300_000, minYears: 3, skills: { engineering: 70, business: 30 }, status: 170 },
      { title: 'Engineering manager', pay: 5_000_000, minYears: 0, skills: { engineering: 75, business: 45 }, minConnections: 35, status: 240 },
    ],
    perks: FORMAL,
    stress: 0.65,
    skillXpPerHour: { engineering: 0.006, intellect: 0.001 },
    hiring: { selectivity: 0.85, academicWeight: 0.45, connectionWeight: 0.3, interviewChance: 0.8 },
    payVolatility: 0,
    traits: ['office', 'headhunt', 'kickback'],
  }),
  job({
    id: 'civil-engineer',
    title: 'Civil engineer',
    employer: 'Bridgeway Construction',
    industry: 'Construction',
    sector: 'professional',
    emoji: '🏗️',
    blurb: 'Sand-filling Eko Atlantic, one storey at a time. COREN registration opens the senior roles.',
    workplaceId: 'eko-atlantic',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 7, hours: 10 },
    currency: 'NGN',
    requirements: { minAge: 21, education: 'bachelors', fields: ['civil', 'building', 'structural', 'engineering'], nysc: true },
    levels: [
      { title: 'Graduate engineer', pay: 250_000, minYears: 1, status: 25 },
      { title: 'Site engineer', pay: 380_000, minYears: 2, skills: { engineering: 35 }, status: 35 },
      { title: 'Senior site engineer', pay: 600_000, minYears: 3, skills: { engineering: 48 }, certifications: ['coren'], status: 55 },
      { title: 'Project manager', pay: 1_000_000, minYears: 3, skills: { engineering: 58, business: 30 }, certifications: ['coren'], status: 85 },
      { title: 'Construction director', pay: 2_000_000, minYears: 0, skills: { engineering: 68, business: 45 }, minConnections: 35, status: 140 },
    ],
    perks: FORMAL,
    stress: 0.6,
    skillXpPerHour: { engineering: 0.0055, business: 0.001 },
    hiring: { selectivity: 0.55, academicWeight: 0.25, connectionWeight: 0.3, interviewChance: 0.6 },
    payVolatility: 0,
    traits: ['office', 'kickback'],
  }),

  // --- Tech ------------------------------------------------------------------------------------------------------
  job({
    id: 'software-engineer',
    title: 'Software engineer',
    employer: 'Paystream',
    industry: 'Fintech',
    sector: 'tech',
    emoji: '💻',
    blurb: 'No degree needed — show them what you can build. Pay climbs fast with skill.',
    workplaceId: 'yaba-hub',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 9, hours: 9 },
    currency: 'NGN',
    requirements: { minAge: 17, skills: { tech: 30 } },
    levels: [
      { title: 'Junior software engineer', pay: 250_000, minYears: 1, status: 25 },
      { title: 'Software engineer', pay: 550_000, minYears: 1.5, skills: { tech: 45 }, status: 40 },
      { title: 'Senior software engineer', pay: 1_100_000, minYears: 2, skills: { tech: 60 }, status: 70 },
      { title: 'Staff engineer', pay: 2_000_000, minYears: 3, skills: { tech: 72 }, status: 110 },
      { title: 'Engineering manager', pay: 3_200_000, minYears: 0, skills: { tech: 75, business: 35, charisma: 35 }, status: 150 },
    ],
    perks: FORMAL,
    stress: 0.55,
    skillXpPerHour: { tech: 0.006, business: 0.0008 },
    hiring: { selectivity: 0.5, academicWeight: 0.1, connectionWeight: 0.15, interviewChance: 0.8 },
    payVolatility: 0,
    traits: ['office', 'headhunt'],
  }),
  job({
    id: 'remote-software-engineer',
    title: 'Remote software engineer (USD)',
    employer: 'Gridline Inc. (San Francisco)',
    industry: 'Tech (foreign)',
    sector: 'tech',
    emoji: '🌍',
    blurb: 'Dollar salary from your bedroom. Needs a laptop, steady power and serious skill — NEPA won’t excuse a missed stand-up.',
    workplaceId: 'yaba-hub',
    workMode: 'remote',
    schedule: { days: MON_FRI, startHour: 13, hours: 9 },
    currency: 'USD',
    requirements: {
      minAge: 18,
      skills: { tech: 50 },
      items: [
        { anyOf: ['laptop'], label: 'A laptop' },
        { anyOf: ['inverter', 'solar', 'generator'], label: 'Steady power at home (inverter, solar or generator)' },
      ],
    },
    levels: [
      { title: 'Software engineer', pay: 1_200, minYears: 1, status: 50 },
      { title: 'Software engineer II', pay: 2_500, minYears: 1.5, skills: { tech: 60 }, status: 75 },
      { title: 'Senior software engineer', pay: 4_500, minYears: 2, skills: { tech: 70 }, status: 110 },
      { title: 'Staff engineer', pay: 7_500, minYears: 3, skills: { tech: 80 }, status: 160 },
      { title: 'Principal engineer', pay: 11_000, minYears: 0, skills: { tech: 88, business: 30 }, status: 220 },
    ],
    perks: { pension: false, paye: true, hmo: false, holidays: false, leaveDays: 15 },
    stress: 0.5,
    skillXpPerHour: { tech: 0.0065 },
    hiring: { selectivity: 0.85, academicWeight: 0.05, connectionWeight: 0.05, interviewChance: 0.9 },
    payVolatility: 0,
    traits: ['headhunt'],
  }),

  // --- Football ---------------------------------------------------------------------------------------------------
  job({
    id: 'football-career',
    title: 'Professional footballer',
    employer: 'MFM FC (NPFL) academy and first team',
    industry: 'Football',
    sector: 'entry',
    emoji: '⚽',
    blurb: 'Soccer: trials at the National Stadium in Surulere as a keeper, defender, midfielder or striker, a first NPFL contract, the captain’s armband, a Super Eagles call-up and, if you are good enough, a move to a club in Europe.',
    workplaceId: 'national-stadium',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 8, hours: 5 },
    currency: 'NGN',
    requirements: { minAge: 16, maxAge: 30, skills: { fitness: 35 } },
    levels: [
      { title: 'Academy trainee', pay: 35_000, minYears: 1, status: 8 },
      { title: 'Reserve-team player', pay: 90_000, minYears: 1.5, skills: { fitness: 45 }, status: 20 },
      { title: 'NPFL first-team player', pay: 230_000, minYears: 2, skills: { fitness: 55, hustle: 20 }, minConnections: 10, status: 60 },
      { title: 'NPFL starter', pay: 320_000, minYears: 3, skills: { fitness: 65, charisma: 20 }, minConnections: 20, status: 110 },
      { title: 'NPFL club captain', pay: 420_000, minYears: 2, skills: { fitness: 75, charisma: 35 }, minConnections: 30, status: 190 },
      { title: 'Super Eagles international', pay: 700_000, minYears: 2, skills: { fitness: 82, charisma: 45 }, minConnections: 45, status: 320 },
      { title: 'Pro abroad (European league)', pay: 1_300_000, minYears: 0, skills: { fitness: 90, charisma: 55 }, minConnections: 60, status: 480 },
    ],
    perks: { pension: true, paye: true, hmo: true, holidays: false, leaveDays: 10 },
    stress: 0.5,
    skillXpPerHour: { fitness: 0.008, charisma: 0.002, hustle: 0.002 },
    hiring: { selectivity: 0.5, academicWeight: 0, connectionWeight: 0.3, interviewChance: 0 },
    payVolatility: 0.1,
    dettyDecemberPay: 1.1,
    traits: [],
    degreeExempt: true,
  }),

  // --- Creative --------------------------------------------------------------------------------------------------
  job({
    id: 'afrobeats-musician',
    title: 'Afrobeats artiste',
    employer: 'Independent (Eko Sound Studios)',
    industry: 'Music',
    sector: 'creative',
    emoji: '🎤',
    blurb: 'Studio sessions, open mics at Freedom Park and praying for one song to blow. It’s a lottery with a beat.',
    workplaceId: 'freedom-park',
    workMode: 'onsite',
    schedule: { days: [3, 4, 5], startHour: 18, hours: 6 },
    currency: 'NGN',
    requirements: { minAge: 16 },
    levels: [
      { title: 'Upcoming artiste', pay: 40_000, minYears: 0.5, status: 10 },
      { title: 'Underground act', pay: 150_000, minYears: 1, skills: { creative: 30, charisma: 20 }, status: 30 },
      { title: 'Buzzing artiste', pay: 900_000, minYears: 1, breakout: true, status: 120 },
      { title: 'Headliner', pay: 3_500_000, minYears: 2, skills: { creative: 60, charisma: 50 }, status: 250 },
      { title: 'Afrobeats star', pay: 9_000_000, minYears: 0, breakout: true, status: 450 },
    ],
    perks: SELF_EMPLOYED,
    stress: 0.4,
    skillXpPerHour: { creative: 0.007, charisma: 0.003 },
    hiring: { selectivity: 0.03, academicWeight: 0, connectionWeight: 0.05, interviewChance: 0 },
    payVolatility: 0.6,
    dettyDecemberPay: 1.8,
    traits: ['music'],
    degreeExempt: true,
  }),
  job({
    id: 'content-creator',
    title: 'Content creator',
    employer: 'Self-employed (TikTok, IG & YouTube)',
    industry: 'Media',
    sector: 'creative',
    emoji: '🤳',
    blurb: 'Skits, GRWMs and brand deals. Most creators earn peanuts; a few go viral and never look back.',
    workplaceId: 'yaba-hub',
    workMode: 'remote',
    schedule: { days: MON_SAT, startHour: 11, hours: 6 },
    currency: 'NGN',
    requirements: { minAge: 16 },
    levels: [
      { title: 'Small creator', pay: 20_000, minYears: 0.5, status: 5 },
      { title: 'Micro-influencer', pay: 150_000, minYears: 1, skills: { creative: 30, charisma: 30 }, status: 30 },
      { title: 'Influencer', pay: 600_000, minYears: 1.5, skills: { creative: 45, charisma: 45 }, status: 80 },
      { title: 'Big influencer', pay: 2_000_000, minYears: 2, skills: { creative: 60, charisma: 60 }, minConnections: 20, status: 160 },
      { title: 'Viral sensation', pay: 5_000_000, minYears: 0, breakout: true, status: 300 },
    ],
    perks: SELF_EMPLOYED,
    stress: 0.35,
    skillXpPerHour: { creative: 0.006, charisma: 0.003, tech: 0.001 },
    hiring: { selectivity: 0.02, academicWeight: 0, connectionWeight: 0, interviewChance: 0 },
    payVolatility: 0.5,
    dettyDecemberPay: 1.4,
    traits: ['viral'],
    degreeExempt: true,
  }),
];

/** No job level pays more than this a month, in naira after the Lagos-boom multiplier. */
export const JOB_MAX_MONTHLY_NGN = 10_000_000;
/** The most a dollar job pays a month: the dollar amount worth `JOB_MAX_MONTHLY_NGN` at the game's base rate (`BASE_USD_RATE`). */
export const JOB_MAX_MONTHLY_USD = Math.floor(JOB_MAX_MONTHLY_NGN / BASE_USD_RATE);
/** A level paying this much a month (in naira, dollars at `BASE_USD_RATE`) or more needs a degree. */
export const JOB_DEGREE_PAY_THRESHOLD_NGN = 3_000_000;
/** The lowest qualification such a level accepts: an HND or a bachelor's degree (or higher). */
export const JOB_DEGREE_EDUCATION: CareerEducationLevel = 'hnd';

/** What a level pays in naira a month (dollar pay at the base rate): the figure the caps and degree rule compare. */
export function jobPayInNaira(currency: JobCurrency, pay: number): number {
  return currency === 'USD' ? pay * BASE_USD_RATE : pay;
}

/** Does a level at this pay need a degree? */
export function payNeedsDegree(currency: JobCurrency, pay: number): boolean {
  return jobPayInNaira(currency, pay) >= JOB_DEGREE_PAY_THRESHOLD_NGN;
}

/**
 * What the game pays: every level x INCOME_MULTIPLIER (naira to the nearest ₦1,000, dollars to the nearest $1), then
 * held to the salary rules: no level pays above `JOB_MAX_MONTHLY_NGN` (dollar jobs: `JOB_MAX_MONTHLY_USD`), and any
 * level paying `JOB_DEGREE_PAY_THRESHOLD_NGN` or more needs an HND/bachelor's degree: as an entry requirement for the
 * first level, as a promotion gate (`education`) for the rest.
 */
function applySalaryRules(job: JobDefinition): JobDefinition {
  const cap = job.currency === 'NGN' ? JOB_MAX_MONTHLY_NGN : JOB_MAX_MONTHLY_USD;
  const entryRank = CAREER_EDUCATION_LEVELS.indexOf(job.requirements.education ?? 'none');
  const degreeRank = CAREER_EDUCATION_LEVELS.indexOf(JOB_DEGREE_EDUCATION);
  const levels = job.levels.map((level) => {
    const pay = Math.min(cap, boosted(level.pay, job.currency === 'NGN' ? 1_000 : 1));
    const needsDegree = !job.degreeExempt && payNeedsDegree(job.currency, pay) && entryRank < degreeRank && CAREER_EDUCATION_LEVELS.indexOf(level.education ?? 'none') < degreeRank;
    return needsDegree ? { ...level, pay, education: JOB_DEGREE_EDUCATION } : { ...level, pay };
  });
  const [entry, ...rest] = levels;
  // The first level has no promotion to gate: a degree there is a requirement to be hired at all.
  if (entry?.education) {
    const { education, ...entryLevel } = entry;
    return { ...job, requirements: { ...job.requirements, education }, levels: [entryLevel, ...rest] };
  }
  return { ...job, levels };
}

/** Abuja's employers: markets and bukas, banks, the civil service, oil and the central bank, embassies, hotels, hospitals and tech. Pay as in real Abuja. */
const ABUJA_JOBS: readonly JobDefinition[] = [
  job({
    id: 'wuse-market-trader',
    title: 'Market trader (Wuse Market)',
    employer: 'Hajia Aisha Foodstuff Store, Wuse Market',
    industry: 'Market trade',
    sector: 'informal',
    emoji: '🧺',
    blurb: 'Tomatoes from Kaduna, yams from Benue, and customers who always say “last price”.',
    workplaceId: 'wuse-market',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 7, hours: 10 },
    currency: 'NGN',
    requirements: {},
    levels: [
      { title: 'Shop assistant', pay: 90_000, minYears: 0.5, status: 3 },
      { title: 'Senior sales hand', pay: 125_000, minYears: 1, skills: { hustle: 25 }, status: 6 },
      { title: 'Stall manager', pay: 180_000, minYears: 0, skills: { hustle: 40, business: 15 }, status: 10 },
    ],
    perks: HUSTLE,
    stress: 0.35,
    skillXpPerHour: { hustle: 0.009, business: 0.002, charisma: 0.001 },
    hiring: OPEN_DOOR,
    payVolatility: 0.12,
    traits: ['kickback'],
  }),
  job({
    id: 'garki-buka-attendant',
    title: 'Buka attendant',
    employer: 'Garki Local Buka',
    industry: 'Food service',
    sector: 'informal',
    emoji: '🍲',
    blurb: 'Serve tuwo and soup to civil servants at lunch rush. Tips are in cash, gist is free.',
    workplaceId: 'garki-buka',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 9, hours: 10 },
    currency: 'NGN',
    requirements: {},
    levels: [
      { title: 'Server', pay: 75_000, minYears: 0.5, status: 2 },
      { title: 'Head server', pay: 105_000, minYears: 1, skills: { hustle: 20 }, status: 5 },
      { title: 'Buka supervisor', pay: 150_000, minYears: 0, skills: { hustle: 35, charisma: 20 }, status: 9 },
    ],
    perks: HUSTLE,
    stress: 0.4,
    skillXpPerHour: { hustle: 0.008, charisma: 0.0015 },
    hiring: OPEN_DOOR,
    payVolatility: 0.15,
    traits: [],
  }),
  job({
    id: 'abuja-bank-contract-staff',
    title: 'Bank contract staff (teller), Abuja',
    employer: 'Capital Trust Bank (via Hallmark Outsourcing)',
    industry: 'Banking',
    sector: 'entry',
    emoji: '🏧',
    blurb: 'A banking hall in the Central Area where every customer is “from the ministry”. A foot in the door.',
    workplaceId: 'central-area-towers',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 7, hours: 10 },
    currency: 'NGN',
    requirements: { minAge: 18, education: 'nd', waecMathsEnglish: true },
    levels: [
      { title: 'Contract teller', pay: 135_000, minYears: 1, status: 10 },
      { title: 'Senior teller', pay: 180_000, minYears: 1.5, skills: { finance: 20 }, status: 14 },
      { title: 'Customer service lead', pay: 250_000, minYears: 0, skills: { finance: 30, charisma: 25 }, status: 20 },
    ],
    perks: { ...FORMAL, leaveDays: 15 },
    stress: 0.55,
    skillXpPerHour: { finance: 0.004, charisma: 0.0015 },
    hiring: { selectivity: 0.45, academicWeight: 0.1, connectionWeight: 0.2, interviewChance: 0.5 },
    payVolatility: 0,
    traits: ['office', 'kickback'],
  }),
  job({
    id: 'federal-civil-service',
    title: 'Civil servant (federal ministry)',
    employer: 'Federal Civil Service Commission',
    industry: 'Public service',
    sector: 'graduate',
    emoji: '🏛️',
    blurb: 'A desk in the Central Area, a file that has been “in transit” since 2019, and a pension. Connections help.',
    workplaceId: 'federal-secretariat',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 8, hours: 8 },
    currency: 'NGN',
    requirements: { minAge: 18, maxAge: 35, education: 'hnd', nysc: true },
    levels: [
      { title: 'Administrative Officer II (GL 08)', pay: 200_000, minYears: 2, status: 22 },
      { title: 'Administrative Officer I (GL 09)', pay: 275_000, minYears: 2, status: 30 },
      { title: 'Senior Administrative Officer (GL 12)', pay: 400_000, minYears: 3, skills: { charisma: 25 }, minConnections: 15, status: 42 },
      { title: 'Principal Administrative Officer (GL 14)', pay: 570_000, minYears: 3, minConnections: 25, status: 62 },
      { title: 'Deputy Director (GL 16)', pay: 780_000, minYears: 4, skills: { business: 30 }, minConnections: 40, status: 95 },
      { title: 'Permanent Secretary', pay: 1_600_000, minYears: 0, skills: { charisma: 55 }, minConnections: 70, status: 270 },
    ],
    perks: { ...FORMAL, leaveDays: 21 },
    stress: 0.3,
    skillXpPerHour: { business: 0.0015, charisma: 0.0015, intellect: 0.001 },
    hiring: { selectivity: 0.8, academicWeight: 0.15, connectionWeight: 0.55, interviewChance: 0.4 },
    payVolatility: 0,
    traits: ['office', 'public-service', 'kickback'],
  }),

  // --- The capital's employers: oil HQs, regulators, embassies, the National Assembly, hotels, hospitals, tech ---
  job({
    id: 'nnpc-graduate-trainee',
    title: 'Graduate trainee (NNPC)',
    employer: 'Nigerian National Petroleum Company Limited',
    industry: 'Oil & gas',
    sector: 'graduate',
    emoji: '🛢️',
    blurb: 'A badge at NNPC Towers, a pension and a ladder to Group General Manager, if the right oga knows your name.',
    workplaceId: 'nnpc-towers',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 8, hours: 9 },
    currency: 'NGN',
    requirements: { minAge: 21, maxAge: 30, education: 'bachelors', minGrade: 'second-upper', nysc: true, waecMathsEnglish: true },
    levels: [
      { title: 'Graduate trainee', pay: 420_000, minYears: 1, status: 40 },
      { title: 'Officer', pay: 650_000, minYears: 2, skills: { business: 25 }, status: 55 },
      { title: 'Senior officer', pay: 1_000_000, minYears: 3, skills: { business: 35, finance: 25 }, status: 80 },
      { title: 'Manager', pay: 1_800_000, minYears: 3, skills: { business: 45, charisma: 35 }, minConnections: 25, status: 120 },
      { title: 'Chief manager', pay: 3_000_000, minYears: 4, skills: { business: 55, charisma: 45 }, minConnections: 40, status: 180 },
      { title: 'Group general manager', pay: 6_000_000, minYears: 0, skills: { business: 68, charisma: 55 }, minConnections: 65, status: 300 },
    ],
    perks: { ...FORMAL, leaveDays: 25 },
    stress: 0.5,
    skillXpPerHour: { business: 0.003, finance: 0.002, charisma: 0.002 },
    hiring: { selectivity: 0.85, academicWeight: 0.3, connectionWeight: 0.5, interviewChance: 0.6 },
    payVolatility: 0,
    traits: ['office', 'public-service', 'kickback', 'headhunt'],
  }),
  job({
    id: 'cbn-analyst',
    title: 'Banking and policy analyst (CBN)',
    employer: 'Central Bank of Nigeria',
    industry: 'Central banking',
    sector: 'graduate',
    emoji: '🏛️',
    blurb: 'Circulars, rate decisions and a cafeteria subsidy. The naira moves; you write the memo.',
    workplaceId: 'cbn-hq',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 8, hours: 9 },
    currency: 'NGN',
    requirements: { minAge: 22, maxAge: 32, education: 'bachelors', fields: ['economics', 'accounting', 'banking-finance', 'computer-science', 'mathematics', 'statistics'], minGrade: 'second-upper', nysc: true },
    levels: [
      { title: 'Assistant analyst', pay: 480_000, minYears: 1.5, status: 45 },
      { title: 'Analyst', pay: 760_000, minYears: 2, skills: { finance: 30 }, status: 65 },
      { title: 'Senior analyst', pay: 1_200_000, minYears: 3, skills: { finance: 45, intellect: 30 }, status: 95 },
      { title: 'Principal manager', pay: 2_200_000, minYears: 4, skills: { finance: 58, business: 35 }, minConnections: 25, status: 150 },
      { title: 'Deputy director', pay: 3_800_000, minYears: 4, skills: { finance: 68, business: 45 }, minConnections: 40, status: 220 },
      { title: 'Director', pay: 6_500_000, minYears: 0, skills: { finance: 75, business: 55, charisma: 45 }, minConnections: 60, status: 320 },
    ],
    perks: { ...FORMAL, leaveDays: 25 },
    stress: 0.5,
    skillXpPerHour: { finance: 0.005, intellect: 0.002, business: 0.0015 },
    hiring: { selectivity: 0.9, academicWeight: 0.5, connectionWeight: 0.3, interviewChance: 0.8 },
    payVolatility: 0,
    traits: ['office', 'public-service', 'headhunt'],
  }),
  job({
    id: 'us-embassy-visa-assistant',
    title: 'Locally employed staff (consular)',
    employer: 'U.S. Embassy Abuja',
    industry: 'Diplomatic service',
    sector: 'graduate',
    emoji: '🛂',
    blurb: 'Visa windows, interview lists and applicants who “only want to attend a wedding”. Strict rules, steady pay.',
    workplaceId: 'us-embassy-abuja',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 7, hours: 9 },
    currency: 'NGN',
    requirements: { minAge: 21, maxAge: 40, education: 'bachelors', minGrade: 'second-lower', nysc: true, waecMathsEnglish: true },
    levels: [
      { title: 'Consular assistant', pay: 420_000, minYears: 1.5, status: 40 },
      { title: 'Consular associate', pay: 640_000, minYears: 2, skills: { charisma: 25 }, status: 60 },
      { title: 'Senior consular associate', pay: 980_000, minYears: 3, skills: { charisma: 35, business: 25 }, status: 85 },
      { title: 'Consular specialist', pay: 1_500_000, minYears: 4, skills: { charisma: 45, business: 35 }, minConnections: 20, status: 120 },
      { title: 'Supervisory specialist', pay: 2_400_000, minYears: 0, skills: { charisma: 55, business: 45 }, minConnections: 35, status: 170 },
    ],
    perks: { ...FORMAL, leaveDays: 24 },
    stress: 0.5,
    skillXpPerHour: { charisma: 0.003, business: 0.0015, intellect: 0.0015 },
    hiring: { selectivity: 0.85, academicWeight: 0.4, connectionWeight: 0.1, interviewChance: 0.9 },
    payVolatility: 0,
    traits: ['office'],
  }),
  job({
    id: 'high-commission-clerk',
    title: 'Locally engaged administrator',
    employer: 'British High Commission Abuja',
    industry: 'Diplomatic service',
    sector: 'entry',
    emoji: '🇬🇧',
    blurb: 'Passports, registers and tea at four. A careful job in a careful building in Maitama.',
    workplaceId: 'uk-high-commission',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 8, hours: 8 },
    currency: 'NGN',
    requirements: { minAge: 20, maxAge: 45, education: 'hnd', waecMathsEnglish: true },
    levels: [
      { title: 'Administrative assistant', pay: 310_000, minYears: 1.5, status: 28 },
      { title: 'Administrative officer', pay: 480_000, minYears: 2.5, skills: { charisma: 20 }, status: 42 },
      { title: 'Senior administrative officer', pay: 760_000, minYears: 3, skills: { charisma: 30, business: 25 }, status: 62 },
      { title: 'Office manager', pay: 1_250_000, minYears: 0, skills: { business: 40, charisma: 35 }, minConnections: 20, status: 100 },
    ],
    perks: { ...FORMAL, leaveDays: 22 },
    stress: 0.35,
    skillXpPerHour: { charisma: 0.002, business: 0.0015 },
    hiring: { selectivity: 0.7, academicWeight: 0.25, connectionWeight: 0.2, interviewChance: 0.8 },
    payVolatility: 0,
    traits: ['office'],
  }),
  job({
    id: 'national-assembly-aide',
    title: 'Legislative aide',
    employer: 'National Assembly (office of a senator)',
    industry: 'Legislature',
    sector: 'graduate',
    emoji: '🏛️',
    blurb: 'Bills, constituency visits and the senator’s phone. The pay is small; “constituency projects” are not.',
    workplaceId: 'national-assembly',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 9, hours: 9 },
    currency: 'NGN',
    requirements: { minAge: 21, education: 'bachelors', nysc: true },
    levels: [
      { title: 'Legislative assistant', pay: 260_000, minYears: 1, status: 30 },
      { title: 'Legislative aide', pay: 420_000, minYears: 2, skills: { charisma: 25 }, minConnections: 15, status: 50 },
      { title: 'Senior legislative aide', pay: 700_000, minYears: 3, skills: { charisma: 38, business: 25 }, minConnections: 30, status: 80 },
      { title: 'Special assistant', pay: 1_200_000, minYears: 4, skills: { charisma: 48, business: 35 }, minConnections: 45, status: 130 },
      { title: 'Chief of staff', pay: 2_200_000, minYears: 0, skills: { charisma: 58, business: 45 }, minConnections: 65, status: 210 },
    ],
    perks: { ...FORMAL, leaveDays: 21 },
    stress: 0.45,
    skillXpPerHour: { charisma: 0.003, business: 0.0015 },
    hiring: { selectivity: 0.6, academicWeight: 0.1, connectionWeight: 0.7, interviewChance: 0.5 },
    payVolatility: 0,
    traits: ['office', 'public-service', 'kickback'],
  }),
  job({
    id: 'gtbank-officer',
    title: 'Banking officer (graduate scheme)',
    employer: 'Guaranty Trust Bank',
    industry: 'Banking',
    sector: 'graduate',
    emoji: '🏦',
    blurb: 'A branch on Aminu Kano Crescent, sales targets and a very good app. Orange everything.',
    workplaceId: 'gtbank-wuse',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 7, hours: 10 },
    currency: 'NGN',
    requirements: { minAge: 20, maxAge: 28, education: 'bachelors', minGrade: 'second-lower', nysc: true, waecMathsEnglish: true },
    levels: [
      { title: 'Graduate trainee', pay: 300_000, minYears: 1, status: 25 },
      { title: 'Banking officer', pay: 450_000, minYears: 2, skills: { finance: 30 }, status: 36 },
      { title: 'Relationship officer', pay: 720_000, minYears: 3, skills: { finance: 42, charisma: 28 }, status: 55 },
      { title: 'Relationship manager', pay: 1_300_000, minYears: 3, skills: { finance: 52, business: 32 }, status: 85 },
      { title: 'Branch manager', pay: 2_300_000, minYears: 4, skills: { finance: 62, business: 45 }, minConnections: 30, status: 140 },
      { title: 'Regional head', pay: 4_200_000, minYears: 0, skills: { finance: 72, business: 58, charisma: 45 }, minConnections: 50, status: 220 },
    ],
    perks: FORMAL,
    stress: 0.7,
    skillXpPerHour: { finance: 0.005, business: 0.002, charisma: 0.0015 },
    hiring: { selectivity: 0.7, academicWeight: 0.35, connectionWeight: 0.25, interviewChance: 0.7 },
    payVolatility: 0,
    traits: ['office', 'headhunt', 'kickback'],
  }),
  job({
    id: 'hilton-front-desk',
    title: 'Hotel front desk',
    employer: 'Transcorp Hilton Abuja',
    industry: 'Hospitality',
    sector: 'entry',
    emoji: '🛎️',
    blurb: 'Delegations, convoys and a lobby that never sleeps. Tips in dollars when a minister checks out.',
    workplaceId: 'transcorp-hilton',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 7, hours: 9 },
    currency: 'NGN',
    requirements: { minAge: 18, education: 'ssce' },
    levels: [
      { title: 'Guest service agent', pay: 160_000, minYears: 1, status: 12 },
      { title: 'Front desk supervisor', pay: 260_000, minYears: 2, skills: { charisma: 25 }, status: 22 },
      { title: 'Front office manager', pay: 480_000, minYears: 3, skills: { charisma: 38, business: 25 }, status: 45 },
      { title: 'Rooms division manager', pay: 850_000, minYears: 4, skills: { charisma: 48, business: 38 }, minConnections: 20, status: 80 },
      { title: 'Hotel general manager', pay: 1_800_000, minYears: 0, skills: { charisma: 58, business: 52 }, minConnections: 40, status: 150 },
    ],
    perks: { ...FORMAL, holidays: false, leaveDays: 18 },
    stress: 0.5,
    skillXpPerHour: { charisma: 0.004, business: 0.001 },
    hiring: { selectivity: 0.4, academicWeight: 0.05, connectionWeight: 0.25, interviewChance: 0.5 },
    payVolatility: 0.1,
    traits: ['office'],
  }),
  job({
    id: 'sheraton-chef',
    title: 'Hotel chef',
    employer: 'Sheraton Abuja Hotel',
    industry: 'Hospitality',
    sector: 'entry',
    emoji: '👨🏾‍🍳',
    blurb: 'Banquets for four hundred, a tasting menu for one minister and a kitchen at 40 degrees.',
    workplaceId: 'sheraton-abuja',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 10, hours: 10 },
    currency: 'NGN',
    requirements: { minAge: 18 },
    levels: [
      { title: 'Commis chef', pay: 120_000, minYears: 1, status: 8 },
      { title: 'Chef de partie', pay: 220_000, minYears: 2, skills: { hustle: 25 }, status: 18 },
      { title: 'Sous chef', pay: 420_000, minYears: 3, skills: { hustle: 38, creative: 25 }, status: 38 },
      { title: 'Executive chef', pay: 900_000, minYears: 0, skills: { hustle: 50, creative: 45, business: 28 }, minConnections: 20, status: 90 },
    ],
    perks: { ...FORMAL, holidays: false, leaveDays: 15 },
    stress: 0.6,
    skillXpPerHour: { creative: 0.003, hustle: 0.004 },
    hiring: { selectivity: 0.3, academicWeight: 0, connectionWeight: 0.2, interviewChance: 0.4 },
    payVolatility: 0.05,
    traits: [],
  }),
  job({
    id: 'galaxy-backbone-engineer',
    title: 'Network and software engineer',
    employer: 'Galaxy Backbone',
    industry: 'Government ICT',
    sector: 'tech',
    emoji: '🌐',
    blurb: 'The federal government’s ICT backbone: data centres, e-government portals and projects that ship “next quarter”.',
    workplaceId: 'central-area-towers',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 8, hours: 9 },
    currency: 'NGN',
    requirements: { minAge: 18, skills: { tech: 28 } },
    levels: [
      { title: 'Junior engineer', pay: 280_000, minYears: 1, status: 28 },
      { title: 'Network engineer', pay: 520_000, minYears: 2, skills: { tech: 42 }, status: 45 },
      { title: 'Senior engineer', pay: 950_000, minYears: 3, skills: { tech: 56 }, status: 70 },
      { title: 'Principal engineer', pay: 1_700_000, minYears: 4, skills: { tech: 68 }, status: 105 },
      { title: 'Head of platform', pay: 2_800_000, minYears: 0, skills: { tech: 74, business: 35 }, minConnections: 25, status: 150 },
    ],
    perks: FORMAL,
    stress: 0.45,
    skillXpPerHour: { tech: 0.006, business: 0.0008 },
    hiring: { selectivity: 0.5, academicWeight: 0.1, connectionWeight: 0.3, interviewChance: 0.8 },
    payVolatility: 0,
    traits: ['office', 'public-service', 'headhunt'],
  }),
  job({
    id: 'nurse-garki-hospital',
    title: 'Nurse (Garki Hospital)',
    employer: 'Garki Hospital',
    industry: 'Healthcare',
    sector: 'professional',
    emoji: '👩🏾‍⚕️',
    blurb: 'Wards full by seven, a generator that coughs at night and patients who bring the whole family.',
    workplaceId: 'garki-hospital',
    workMode: 'onsite',
    schedule: { days: MON_SAT, startHour: 7, hours: 8 },
    currency: 'NGN',
    requirements: { minAge: 19, education: 'nd', fields: ['nursing'], certifications: ['nmcn'] },
    levels: [
      { title: 'Nursing officer II', pay: 185_000, minYears: 1, status: 20 },
      { title: 'Nursing officer I', pay: 235_000, minYears: 2, skills: { medicine: 30 }, status: 28 },
      { title: 'Senior nursing officer', pay: 310_000, minYears: 3, skills: { medicine: 40 }, status: 38 },
      { title: 'Principal nursing officer', pay: 390_000, minYears: 3, skills: { medicine: 50 }, status: 50 },
      { title: 'Chief nursing officer', pay: 490_000, minYears: 0, skills: { medicine: 58, business: 20 }, status: 65 },
    ],
    perks: { ...FORMAL, holidays: false, leaveDays: 21 },
    stress: 0.7,
    skillXpPerHour: { medicine: 0.005, charisma: 0.001 },
    hiring: { selectivity: 0.4, academicWeight: 0.15, connectionWeight: 0.2, interviewChance: 0.4 },
    payVolatility: 0,
    traits: ['health', 'office'],
  }),
  job({
    id: 'uniabuja-lecturer',
    title: 'Lecturer (University of Abuja)',
    employer: 'University of Abuja',
    industry: 'Higher education',
    sector: 'professional',
    emoji: '🎓',
    blurb: 'Lecture notes, marking by candlelight and an ASUU strike every other year. Prestige, pension and patience.',
    workplaceId: 'university-of-abuja',
    workMode: 'onsite',
    schedule: { days: MON_FRI, startHour: 8, hours: 8 },
    currency: 'NGN',
    requirements: { minAge: 22, education: 'bachelors', minGrade: 'second-upper', nysc: true },
    levels: [
      { title: 'Graduate assistant', pay: 220_000, minYears: 2, status: 30 },
      { title: 'Assistant lecturer', pay: 320_000, minYears: 2, skills: { intellect: 30 }, status: 45 },
      { title: 'Lecturer I', pay: 480_000, minYears: 3, skills: { intellect: 42 }, status: 65 },
      { title: 'Senior lecturer', pay: 720_000, minYears: 4, skills: { intellect: 54 }, status: 95 },
      { title: 'Professor', pay: 1_300_000, minYears: 0, skills: { intellect: 68 }, minConnections: 25, status: 170 },
    ],
    perks: { ...FORMAL, leaveDays: 30 },
    stress: 0.4,
    skillXpPerHour: { intellect: 0.004, charisma: 0.001 },
    hiring: { selectivity: 0.7, academicWeight: 0.6, connectionWeight: 0.3, interviewChance: 0.8 },
    payVolatility: 0,
    traits: ['office', 'public-service'],
  }),
];

export const JOBS: readonly JobDefinition[] = [...LAGOS_JOBS, ...ABUJA_JOBS].map(applySalaryRules);

const JOB_INDEX: ReadonlyMap<string, JobDefinition> = new Map(JOBS.map((definition) => [definition.id, definition]));

export function findJob(id: string): JobDefinition | undefined {
  return JOB_INDEX.get(id);
}

/**
 * The city a job is in: its workplace's. Remote jobs have none (`null`): they are on every city's board, and a
 * roaming job reports to a motor park in its city.
 */
export function jobCityId(job: Pick<JobDefinition, 'workMode' | 'workplaceId'>): CityId | null {
  if (job.workMode === 'remote') return null;
  return cityOfVenueId(job.workplaceId);
}

/** True if the job is on the given city's board. */
export function jobInCity(job: Pick<JobDefinition, 'workMode' | 'workplaceId'>, cityId: CityId): boolean {
  const city = jobCityId(job);
  return city === null || city === cityId;
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers shared by server and client
// ---------------------------------------------------------------------------------------------------------------

/** Degree field match by hyphen-separated segments: `engineering` matches `civil-engineering`. */
export function fieldMatches(required: string, actual: string): boolean {
  return `-${actual.toLowerCase()}-`.includes(`-${required.toLowerCase()}-`);
}

export function educationRank(level: CareerEducationLevel): number {
  return CAREER_EDUCATION_LEVELS.indexOf(level);
}

/** Entry and top pay in the job's currency. */
export function jobPayRange(definition: JobDefinition): { readonly min: number; readonly max: number } {
  const pays = definition.levels.map((level) => level.pay);
  return { min: Math.min(...pays), max: Math.max(...pays) };
}

/** Paid hours in a typical week. */
export function weeklyJobHours(definition: JobDefinition): number {
  return definition.schedule.days.length * definition.schedule.hours;
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function formatHour(hour: number): string {
  const normalised = ((hour % 24) + 24) % 24;
  return `${String(Math.floor(normalised)).padStart(2, '0')}:${String(Math.round((normalised % 1) * 60)).padStart(2, '0')}`;
}

function formatDays(days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return 'No fixed days';
  const contiguous = sorted.every((day, index) => index === 0 || day === (sorted[index - 1] ?? day) + 1);
  if (contiguous && sorted.length > 2) return `${DAY_SHORT[first]}–${DAY_SHORT[last]}`;
  return sorted.map((day) => DAY_SHORT[day] ?? '').join(', ');
}

/** "Mon–Fri · 08:00–17:00", "Mon–Sat · 19:00–06:00 (nights)". */
export function formatJobSchedule(schedule: JobSchedule): string {
  const end = schedule.startHour + schedule.hours;
  const nights = end > 24 ? ' (nights)' : '';
  return `${formatDays(schedule.days)} · ${formatHour(schedule.startHour)}–${formatHour(end)}${nights}`;
}
