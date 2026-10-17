'use client';

import { useEffect, useRef } from 'react';
import { SKILL_KEYS, SKILL_LABELS, type SkillKey, type Skills } from '@insidelife/shared';
import { toast } from '@/common/components';
import { useUi } from './ui-store';
import { useSnapshot } from './snapshot';

/** Smallest rise worth telling the player about. */
const MIN_GAIN = 0.05;

export interface SkillChange {
  readonly skill: SkillKey;
  readonly before: number;
  readonly after: number;
}

/** Skills that went up between two snapshots (a drop never happens through play; ignored). */
export function skillGains(before: Skills, after: Skills): SkillChange[] {
  return SKILL_KEYS.filter((skill) => after[skill] - before[skill] >= MIN_GAIN).map((skill) => ({
    skill,
    before: before[skill],
    after: after[skill],
  }));
}

/** "Handiwork +3 → 27"; small gains keep a decimal so they never read "+0". */
export function formatSkillGain(change: SkillChange): string {
  const gain = change.after - change.before;
  const whole = Math.round(gain);
  const text = whole >= 1 ? `${whole}` : gain.toFixed(1);
  const value = whole >= 1 ? `${Math.round(change.after)}` : change.after.toFixed(1);
  return `${SKILL_LABELS[change.skill]} +${text} → ${value}`;
}

/** Skill names mentioned in a goal step's text ("Handiwork reaches 30" → ['trade']). */
export function skillsMentioned(text: string): SkillKey[] {
  return SKILL_KEYS.filter((skill) => new RegExp(`\\b${SKILL_LABELS[skill]}\\b`, 'i').test(text));
}

/** Opens Me → Skills. */
export function openSkills(): void {
  useUi.getState().openPhone('me', 'skills');
}

/**
 * Skills grow silently on the server when an activity, class or shift finishes. This tells the player the moment a
 * fresh snapshot shows a rise, so a goal that says "raise Handiwork" visibly pays off.
 */
export function useSkillChangeToasts(): void {
  const { data } = useSnapshot();
  const id = data?.character.id;
  const skills = data?.character.skills;
  const last = useRef<{ id: string; skills: Skills } | null>(null);
  useEffect(() => {
    if (!id || !skills) return;
    const previous = last.current;
    last.current = { id, skills };
    if (!previous || previous.id !== id) return;
    const gains = skillGains(previous.skills, skills);
    if (gains.length === 0) return;
    toast({
      title: gains.length === 1 ? 'Skill up' : 'Skills up',
      body: gains.map(formatSkillGain).join(' · '),
      tone: 'good',
      actionLabel: 'See skills',
      onOpen: openSkills,
    });
  }, [id, skills]);
}
