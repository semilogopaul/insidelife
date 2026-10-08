import { Injectable } from '@nestjs/common';
import { findAction, validateHabits, type Habit, type UpdateSettingsRequest } from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import { unmetRequirement } from '../simulation/action-requirements.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';

/** Player preferences that steer the autopilot: lifestyle, default transport and daily habits. */
@Injectable()
export class SettingsService {
  constructor(private readonly planner: TimelinePlanner) {}

  async update(ctx: SimulationContext, request: UpdateSettingsRequest): Promise<void> {
    if (request.lifestyle) ctx.character.lifestyle = request.lifestyle;
    if (request.defaultTransport) ctx.character.defaultTransport = request.defaultTransport;
    if (request.habits) await this.setHabits(ctx, request.habits);
    ctx.invalidate('profile-context');
  }

  private async setHabits(ctx: SimulationContext, habits: readonly Habit[]): Promise<void> {
    const problem = validateHabits(habits);
    if (problem) throw new GameRuleException('INVALID_HABITS', problem);
    const itemTags = await this.planner.itemTags(ctx);
    for (const habit of habits) {
      const action = findAction(habit.actionId);
      const unmet = action ? unmetRequirement(action, { age: ctx.age, skills: ctx.character.skills, itemTags }) : null;
      if (unmet) throw new GameRuleException(unmet.code, `${action!.label}: ${unmet.message}`);
    }
    // Store plain objects (not DTO instances) in the jsonb column.
    ctx.character.habits = habits.map(({ actionId, startMinute, durationMinutes, days }) => ({ actionId, startMinute, durationMinutes, days }));
    ctx.character.habitsPausedUntil = null;
  }
}
