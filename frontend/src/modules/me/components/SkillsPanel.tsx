import { SKILL_KEYS, SKILL_LABELS, SKILL_MAX, SKILL_UNLOCKS, type Skills } from '@insidelife/shared';
import { ProgressBar } from '@/common/components';

/** Every skill with its level and what it unlocks, highest first. */
export function SkillsPanel({ skills }: { readonly skills: Skills }) {
  const ordered = [...SKILL_KEYS].sort((a, b) => skills[b] - skills[a]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-soft">
        Skills grow when you finish activities, classes and shifts. You’ll get a “Skill up” alert each time one rises.
      </p>
      <ul className="flex flex-col gap-2.5" aria-label="Skills">
        {ordered.map((skill) => (
          <li key={skill} className="flex flex-col gap-1.5 rounded-card bg-paper-2 p-3 ring-1 ring-line">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="type-title text-base">{SKILL_LABELS[skill]}</h4>
              <span className="tabular text-sm font-bold">{skills[skill].toFixed(1)} / {SKILL_MAX}</span>
            </div>
            <ProgressBar value={skills[skill]} max={SKILL_MAX} label={`${SKILL_LABELS[skill]} level`} />
            <p className="text-sm text-text-soft">{SKILL_UNLOCKS[skill]}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
