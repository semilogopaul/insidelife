import { Injectable, type OnModuleInit } from '@nestjs/common';
import { HABIT_TARGET, SKILL_KEYS, SKILL_LABELS, findAction, formatGameDuration, type ActionDefinition } from '@insidelife/shared';
import type { ActivityState } from '../../characters/entities/character.entity.js';
import type { SimulationSystem } from '../interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation-context.js';
import { SimulationRegistry } from '../simulation-registry.service.js';

const DAYS_PER_DIGEST = 7;
/** Skill changes smaller than this aren't worth a line. */
const MIN_SKILL_GAIN = 0.5;

/**
 * Daily habits run on the autopilot (see the planner); this system keeps score. Completed habit sessions are tallied
 * and summarised once a game week ("Learn to code 10h · Tech 31 → 34"), which also lands in the away report.
 */
@Injectable()
export class HabitsSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'habits';
  readonly order = 30;

  constructor(private readonly registry: SimulationRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    if (activity.targetId !== HABIT_TARGET) return;
    const character = ctx.character;
    const log = character.habitLog ?? { weekStartDay: Math.floor(activity.startedAt / 1440), minutes: {}, skillsAtStart: character.skills };
    const minutes = activity.endsAt - activity.startedAt;
    character.habitLog = { ...log, minutes: { ...log.minutes, [action.id]: (log.minutes[action.id] ?? 0) + minutes } };
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const character = ctx.character;
    const log = character.habitLog;
    if (!log || dayIndex - log.weekStartDay < DAYS_PER_DIGEST - 1) return;
    character.habitLog = null;

    const sessions = Object.entries(log.minutes)
      .filter(([, minutes]) => minutes > 0)
      .map(([actionId, minutes]) => `${findAction(actionId)?.label ?? actionId} ${formatGameDuration(minutes)}`);
    if (sessions.length === 0) return;
    const growth = SKILL_KEYS.filter((skill) => character.skills[skill] - log.skillsAtStart[skill] >= MIN_SKILL_GAIN).map(
      (skill) => `${SKILL_LABELS[skill]} ${Math.round(log.skillsAtStart[skill])} → ${Math.round(character.skills[skill])}`,
    );
    const body = [sessions.join(' · '), growth.length > 0 ? growth.join(' · ') : 'Small steps still count. Keep going.'].join('\n');
    ctx.notify({ kind: 'achievement', title: 'Your week of habits', body, tone: 'good' });
  }
}
