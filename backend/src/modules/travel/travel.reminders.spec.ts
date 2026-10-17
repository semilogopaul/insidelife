import { describe, expect, it } from 'vitest';
import { flightWindows } from '@insidelife/shared';
import { CHECK_IN_WARNING_MINUTES, REMINDER, REMINDER_STALE_MINUTES, changedGate, dueReminders } from './travel.rules.js';

const DEPART = 100_000;
const w = flightWindows({ departAt: DEPART });
const booking = (status: 'booked' | 'checked-in', notified = 0) => ({ id: '3f1c1d0e-0000-4000-8000-000000000001', status, departAt: DEPART, notified });

describe('flight reminders', () => {
  it('warns before check-in closes, only while still unchecked-in', () => {
    const at = w.checkInClosesAt - CHECK_IN_WARNING_MINUTES;
    expect(dueReminders(booking('booked'), at - 1)).toEqual([]);
    expect(dueReminders(booking('booked'), at).map((reminder) => reminder.kind)).toContain('CHECK_IN_CLOSING');
    expect(dueReminders(booking('checked-in'), at).map((reminder) => reminder.kind)).not.toContain('CHECK_IN_CLOSING');
  });

  it('announces boarding at the gate opening, only once checked in', () => {
    expect(dueReminders(booking('checked-in'), w.boardingOpensAt).map((reminder) => reminder.kind)).toContain('BOARDING');
    expect(dueReminders(booking('booked'), w.boardingOpensAt).map((reminder) => reminder.kind)).not.toContain('BOARDING');
  });

  it('sends each reminder once and nothing after the gate closes', () => {
    const all = REMINDER.CHECK_IN_CLOSING | REMINDER.GATE_CHANGE | REMINDER.BOARDING;
    expect(dueReminders(booking('checked-in', all), w.boardingOpensAt + 1)).toEqual([]);
    expect(dueReminders(booking('checked-in'), w.gateClosesAt)).toEqual([]);
  });

  it('marks reminders from a long offline catch-up stale instead of nagging', () => {
    const [first] = dueReminders(booking('booked'), w.checkInClosesAt - CHECK_IN_WARNING_MINUTES + REMINDER_STALE_MINUTES + 1);
    expect(first?.kind).toBe('CHECK_IN_CLOSING');
    expect(first?.stale).toBe(true);
    const fresh = dueReminders(booking('checked-in'), w.boardingOpensAt + 1).find((reminder) => reminder.kind === 'BOARDING');
    expect(fresh?.stale).toBe(false);
  });

  it('orders them oldest first', () => {
    const kinds = dueReminders(booking('checked-in'), w.boardingOpensAt + 1).map((reminder) => reminder.kind);
    expect(kinds.indexOf('GATE_CHANGE')).toBeLessThan(kinds.indexOf('BOARDING'));
  });
});

describe('gate changes', () => {
  it('are seeded: the same booking always gets the same answer, and a change is a different gate', () => {
    let changed = 0;
    for (let index = 0; index < 400; index++) {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      const gate = changedGate(id, 'A1');
      expect(changedGate(id, 'A1')).toBe(gate);
      if (gate !== null) {
        changed++;
        expect(gate).not.toBe('A1');
        expect(gate).toMatch(/^[AB][1-8]$/);
      }
    }
    expect(changed).toBeGreaterThan(40);
    expect(changed).toBeLessThan(130);
  });
});
