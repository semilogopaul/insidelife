import { describe, expect, it } from 'vitest';
import { SERVICE_POINTS, findVehicle, workshopRepairCost, type DrivenVehicleDto } from '@insidelife/shared';
import { nothingToDo, parseServiceAction, serviceActionId, serviceOffer, type RunningCar } from '../flow/service-offers';

const station = SERVICE_POINTS.find((point) => point.kind === 'fuel');
const workshop = SERVICE_POINTS.find((point) => point.kind === 'mechanic');
if (!station || !workshop) throw new RangeError('no service points');

const vehicle = { ownedVehicleId: 'car-1', vehicleId: 'peugeot-406-2004', fuelType: 'petrol', fuelEconomyKmPerLitre: 11 } as DrivenVehicleDto;
const car = (running: Partial<RunningCar['running']> = {}): RunningCar => ({ vehicle, running: { fuelLitres: 10, tankLitres: 45, condition: 80, brokenDown: false, ...running } });
const prices = { fuelPrice: 1_350, priceIndex: 1 };

describe('service offers', () => {
  it('fills up what the tank has room for, at the pump price, with a 10 L top-up as a second choice', () => {
    const offer = serviceOffer(station, car(), prices);
    expect(offer.label).toBe('Fill up · 35 L · ₦47,250');
    expect(offer.more?.[0]?.label).toBe('Buy 10 L · ₦13,500');
    expect(parseServiceAction(offer.id)).toEqual({ pointId: station.id, litres: null });
    expect(parseServiceAction(offer.more?.[0]?.id ?? '')).toEqual({ pointId: station.id, litres: 10 });
  });

  it('says so when the tank is full, or the station is dry today (scarcity)', () => {
    expect(serviceOffer(station, car({ fuelLitres: 45 }), prices).disabled).toBe('Your tank is full');
    expect(serviceOffer(station, car(), { ...prices, dry: true }).disabled).toMatch(/No fuel here today/);
  });

  it('prices the mechanic like the server, and fixes breakdowns first', () => {
    const def = findVehicle('peugeot-406-2004');
    const offer = serviceOffer(workshop, car({ condition: 40, brokenDown: true }), prices);
    expect(offer.label).toContain('Fix the breakdown');
    expect(offer.label).toContain((def ? workshopRepairCost(def, 40, true, 1) : 0).toLocaleString('en-NG'));
    expect(serviceOffer(workshop, car({ condition: 100 }), prices).disabled).toBe('Your car is in top shape');
  });

  it('round-trips ids that contain colons', () => {
    expect(parseServiceAction(serviceActionId('fuel:12:3', 10))).toEqual({ pointId: 'fuel:12:3', litres: 10 });
    expect(parseServiceAction('play:door:x')).toBeNull();
  });
});

describe('cards that have nothing to offer', () => {
  it('hides a full tank and a car in top shape, but keeps a dry station warning', () => {
    expect(nothingToDo(serviceOffer(station, car({ fuelLitres: 45 }), prices))).toBe(true);
    expect(nothingToDo(serviceOffer(workshop, car({ condition: 100 }), prices))).toBe(true);
    expect(nothingToDo(serviceOffer(station, car(), { ...prices, dry: true }))).toBe(false);
    expect(nothingToDo(serviceOffer(station, car(), prices))).toBe(false);
  });
});
