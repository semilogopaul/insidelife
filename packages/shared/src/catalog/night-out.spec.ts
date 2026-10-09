import { describe, expect, it } from 'vitest';
import { fromDateParts } from '../time/calendar.js';
import {
  NIGHT_OUT_ITEMS,
  NIGHT_OUT_ITEM_IDS,
  NIGHT_OUT_RULES,
  NIGHT_OUT_SECTIONS,
  nextShoutoutSlot,
  nightOutBasePrice,
  nightOutClout,
  nightOutEndsAt,
  nightOutPriceBand,
  nightOutSoldAt,
} from './social.js';
import { findVenue } from './venues.js';

const at = (day: number, hour: number, minute = 0): number => fromDateParts({ year: 2027, month: 1, day, hour, minute });

describe('night-out menu', () => {
  it('fills every section, ids match their keys, and shoutouts never target anyone', () => {
    for (const id of NIGHT_OUT_ITEM_IDS) expect(NIGHT_OUT_ITEMS[id].id).toBe(id);
    for (const section of NIGHT_OUT_SECTIONS) expect(NIGHT_OUT_ITEM_IDS.some((id) => NIGHT_OUT_ITEMS[id].section === section)).toBe(true);
    for (const id of NIGHT_OUT_ITEM_IDS) {
      const item = NIGHT_OUT_ITEMS[id];
      if (item.kind === 'shoutout') expect(item.target, id).toBe('none');
      if (item.kind === 'bottle') expect(item.target, id).toBe('required');
      expect(item.perNight, id).toBeGreaterThan(0);
      expect(item.clout, id).toBeLessThanOrEqual(NIGHT_OUT_RULES.maxCloutPerNight);
    }
  });

  it('prices bottles and shoutouts by tier', () => {
    const { 'premium-vodka': vodka, champagne, cognac, 'bottle-parade': parade } = NIGHT_OUT_ITEMS;
    expect(vodka.basePrice).toBeLessThan(champagne.basePrice);
    expect(champagne.basePrice).toBeLessThan(cognac.basePrice);
    expect(cognac.basePrice).toBeLessThan(parade.basePrice);
    expect(NIGHT_OUT_ITEMS['shoutout-basic'].durationMs).toBeLessThan(NIGHT_OUT_ITEMS['shoutout-big'].durationMs);
    expect(NIGHT_OUT_ITEMS['shoutout-big'].durationMs).toBeLessThan(NIGHT_OUT_ITEMS['shoutout-odogwu'].durationMs);
  });

  it('charges the Island’s big doors more than a student bar', () => {
    const quilox = findVenue('quilox')!;
    const leftJoint = findVenue('yaba-left-joint')!;
    const allen = findVenue('allen-nights')!;
    expect(nightOutPriceBand(quilox)).toBeGreaterThan(nightOutPriceBand(allen));
    expect(nightOutPriceBand(allen)).toBeGreaterThan(nightOutPriceBand(leftJoint));
    expect(nightOutBasePrice(NIGHT_OUT_ITEMS.champagne, allen)).toBe(350_000);
    expect(nightOutBasePrice(NIGHT_OUT_ITEMS.champagne, leftJoint)).toBe(210_000);
    expect(nightOutBasePrice(NIGHT_OUT_ITEMS.champagne, quilox)).toBe(455_000);
  });

  it('keeps parades and champagne showers to clubs and event centres', () => {
    expect(nightOutSoldAt(NIGHT_OUT_ITEMS['bottle-parade'], 'club')).toBe(true);
    expect(nightOutSoldAt(NIGHT_OUT_ITEMS['bottle-parade'], 'bar')).toBe(false);
    expect(nightOutSoldAt(NIGHT_OUT_ITEMS.champagne, 'bar')).toBe(true);
    expect(nightOutSoldAt(NIGHT_OUT_ITEMS.champagne, 'buka')).toBe(false);
  });

  it('caps nightlife clout per night', () => {
    expect(nightOutClout(NIGHT_OUT_ITEMS['bottle-parade'], 0)).toBe(25);
    expect(nightOutClout(NIGHT_OUT_ITEMS['bottle-parade'], NIGHT_OUT_RULES.maxCloutPerNight - 5)).toBe(5);
    expect(nightOutClout(NIGHT_OUT_ITEMS.champagne, NIGHT_OUT_RULES.maxCloutPerNight)).toBe(0);
  });
});

describe('shoutout queue', () => {
  it('starts right away on an empty queue and waits its turn otherwise', () => {
    const now = 1_000_000;
    expect(nextShoutoutSlot(null, now)).toBe(now + NIGHT_OUT_RULES.shoutoutLeadMs);
    expect(nextShoutoutSlot(now - 5_000, now)).toBe(now + NIGHT_OUT_RULES.shoutoutLeadMs);
    expect(nextShoutoutSlot(now + 20_000, now)).toBe(now + 20_000 + NIGHT_OUT_RULES.shoutoutGapMs);
  });
});

describe('nightOutEndsAt', () => {
  it('ends tonight at closing time, and never after 06:00', () => {
    const club = findVenue('allen-nights')!; // 22:00-06:00
    const bar = findVenue('yaba-left-joint')!; // 12:00-02:00
    const quilox = findVenue('quilox')!; // 23:00-07:00
    const ekoHotel = findVenue('eko-hotel')!; // always open
    expect(nightOutEndsAt(club, at(3, 23))).toBe(at(4, 6));
    expect(nightOutEndsAt(club, at(4, 2))).toBe(at(4, 6));
    expect(nightOutEndsAt(bar, at(3, 13))).toBe(at(4, 2));
    expect(nightOutEndsAt(bar, at(4, 1))).toBe(at(4, 2));
    expect(nightOutEndsAt(quilox, at(4, 1))).toBe(at(4, 6));
    expect(nightOutEndsAt(ekoHotel, at(3, 15))).toBe(at(4, 6));
  });
});
