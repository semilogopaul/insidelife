import { describe, expect, it } from 'vitest';
import { HABIT_TARGET, findAction, type Skills } from '@insidelife/shared';
import type { CharacterEntity } from '../../characters/entities/character.entity.js';
import type { WorldService } from '../../world/world.service.js';
import { SimulationContext } from '../simulation-context.js';
import { SimulationRegistry } from '../simulation-registry.service.js';
import { HabitsSystem } from './habits.system.js';

const skills = (tech: number): Skills =>
  ({ intellect: 20, tech, finance: 0, medicine: 0, law: 0, engineering: 0, business: 0, creative: 0, charisma: 0, fitness: 20, cooking: 0, trade: 0, hustle: 0 }) as Skills;

function ctxAt(character: CharacterEntity, t: number): SimulationContext {
  return new SimulationContext(character, {} as never, {} as WorldService, t);
}

describe('HabitsSystem', () => {
  it('tallies habit sessions and sends one weekly digest with skill growth', async () => {
    const system = new HabitsSystem(new SimulationRegistry());
    const character = { id: 'c1', skills: skills(30), habitLog: null } as unknown as CharacterEntity;
    const code = findAction('learn-code')!;
    for (let day = 0; day < 5; day++) {
      const start = day * 1440 + 20 * 60;
      await system.onActionComplete(ctxAt(character, start + 120), code, { actionId: 'learn-code', startedAt: start, endsAt: start + 120, locationId: 'home:c1', targetId: HABIT_TARGET, cost: 0 });
    }
    // Explicit (non-habit) sessions don't count.
    await system.onActionComplete(ctxAt(character, 500), code, { actionId: 'learn-code', startedAt: 380, endsAt: 500, locationId: 'home:c1', cost: 0 });
    expect(character.habitLog?.minutes['learn-code']).toBe(600);

    character.skills = skills(33.4);
    const midWeek = ctxAt(character, 3 * 1440);
    await system.onDayEnd(midWeek, 3);
    expect(midWeek.notifications).toHaveLength(0);

    const weekEnd = ctxAt(character, 7 * 1440);
    await system.onDayEnd(weekEnd, 6);
    expect(weekEnd.notifications).toHaveLength(1);
    expect(weekEnd.notifications[0]!.body).toContain('Learn to code 10h');
    expect(weekEnd.notifications[0]!.body).toContain('Tech 30 → 33');
    expect(character.habitLog).toBeNull();
  });
});
