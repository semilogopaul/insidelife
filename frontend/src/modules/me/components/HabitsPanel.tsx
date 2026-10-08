'use client';

import { AlarmClock, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { HABIT_DAYS, HABIT_MIN_ENERGY, MAX_HABITS, findAction, formatGameDuration, validateHabits, type CharacterDto, type Habit, type HabitActionId } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';
import { useItemTags, useSaveHabits } from '../hooks/use-habits';
import {
  DAY_LABELS,
  HABIT_ACTIONS,
  HABIT_BUILDS,
  HABIT_START_OPTIONS,
  draftHabit,
  formatMinuteOfDay,
  habitsEqual,
  unmetHabitRequirement,
  type HabitSubject,
  type UnmetHabitRequirement,
} from '../services/habits';

/**
 * Daily habits: up to two free home activities the autopilot runs while you're away (most game days pass offline).
 * Edit, then save — the whole list is replaced on the server. Requirements show inline with the next step.
 */
const NO_HABITS: readonly Habit[] = [];

export function HabitsPanel({ character }: { readonly character: CharacterDto }) {
  // Snapshots from a server that predates habits omit the field.
  const saved = (character.habits as readonly Habit[] | undefined) ?? NO_HABITS;
  const [draft, setDraft] = useState<readonly Habit[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const tags = useItemTags();
  const save = useSaveHabits();
  const habits = draft ?? saved;
  const dirty = draft !== null && !habitsEqual(draft, saved);
  const problem = validateHabits(habits);
  const subject: HabitSubject = { age: character.age, skills: character.skills, itemTags: tags.data ?? null };

  const edit = (next: readonly Habit[]): void => {
    setServerError(null);
    setDraft(next);
  };
  const update = (index: number, patch: Partial<Habit>): void => edit(habits.map((habit, i) => (i === index ? { ...habit, ...patch } : habit)));

  const submit = (): void => {
    if (problem || !draft) return;
    save.mutate(draft, {
      onSuccess: () => {
        gameEvents.emit('sfx', { id: 'ui-success' });
        toast({ title: draft.length === 0 ? 'Habits cleared' : 'Habits saved', body: draft.length === 0 ? undefined : 'Your autopilot will keep them while you’re away.', tone: 'good' });
        setDraft(null);
      },
      onError: (error) => {
        gameEvents.emit('sfx', { id: 'ui-error' });
        setServerError(errorMessage(error));
      },
    });
  };

  return (
    <section aria-label="Daily habits" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="type-title text-xl">Daily habits</h3>
        <span className="tabular text-sm font-bold text-text-soft">
          {habits.length} of {MAX_HABITS}
        </span>
      </div>
      <p className="flex gap-2 rounded-card bg-paper-2 p-3 text-sm text-text-soft">
        <AlarmClock size={18} aria-hidden className="mt-0.5 shrink-0 text-ink" />
        <span>
          Your autopilot does these while you’re away — that’s how skills grow steadily. Runs when you’re home and not too tired (energy {HABIT_MIN_ENERGY}+). Starting
          something else pauses it for that session; an early habit gets you up early.
        </span>
      </p>

      {habits.length === 0 && !picking && <p className="py-2 text-center text-sm text-text-soft">No habits yet. Pick something to do every day.</p>}

      <ul className="flex flex-col gap-2.5">
        {habits.map((habit, index) => (
          <li key={`${habit.actionId}-${index}`}>
            <HabitCard
              habit={habit}
              unmet={unmetHabitRequirement(habit.actionId, subject)}
              onChange={(patch) => update(index, patch)}
              onRemove={() => edit(habits.filter((_, i) => i !== index))}
            />
          </li>
        ))}
      </ul>

      {picking ? (
        <HabitPicker
          taken={habits.map((habit) => habit.actionId)}
          subject={subject}
          onPick={(actionId) => {
            edit([...habits, draftHabit(actionId, habits)]);
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <Button variant="paper" icon={<Plus size={18} aria-hidden />} disabled={habits.length >= MAX_HABITS} onClick={() => setPicking(true)}>
          {habits.length >= MAX_HABITS ? `Up to ${MAX_HABITS} habits` : 'Add a habit'}
        </Button>
      )}

      {(problem || serverError) && (
        <p role="alert" className="rounded-chip bg-okada-soft px-3 py-2 text-sm font-bold text-okada">
          {serverError ?? problem}
        </p>
      )}
      {dirty && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="paper"
            onClick={() => {
              setDraft(null);
              setServerError(null);
            }}
          >
            Discard
          </Button>
          <Button onClick={submit} disabled={problem !== null} loading={save.isPending}>
            Save habits
          </Button>
        </div>
      )}
    </section>
  );
}

function HabitCard({
  habit,
  unmet,
  onChange,
  onRemove,
}: {
  readonly habit: Habit;
  readonly unmet: UnmetHabitRequirement | null;
  readonly onChange: (patch: Partial<Habit>) => void;
  readonly onRemove: () => void;
}) {
  const action = findAction(habit.actionId);
  const timeId = useId();
  if (!action) return null;
  return (
    <article className="flex flex-col gap-3 rounded-card bg-paper-2 p-3.5 ring-1 ring-line">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-card bg-paper text-2xl shadow-[var(--shadow-lift)]">
          {action.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="type-title text-lg leading-tight">{action.label}</h4>
          <p className="text-sm text-text-soft">{HABIT_BUILDS[habit.actionId]}</p>
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${action.label}`} className="grid size-10 shrink-0 place-items-center rounded-full text-text-soft hover:bg-paper-3 hover:text-okada">
          <Trash2 size={18} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor={timeId} className="w-14 shrink-0 text-sm font-bold">
          Starts
        </label>
        <select id={timeId} value={habit.startMinute} onChange={(event) => onChange({ startMinute: Number(event.target.value) })} className="h-10 flex-1 rounded-chip bg-paper px-2 font-bold ring-1 ring-line">
          {HABIT_START_OPTIONS.map((minute) => (
            <option key={minute} value={minute}>
              {formatMinuteOfDay(minute)}
            </option>
          ))}
        </select>
      </div>

      <Chips
        label="Length"
        options={action.durations.map((minutes) => ({ value: minutes, label: formatGameDuration(minutes) }))}
        value={habit.durationMinutes}
        onChange={(durationMinutes) => onChange({ durationMinutes })}
      />
      <Chips label="Days" options={HABIT_DAYS.map((days) => ({ value: days, label: DAY_LABELS[days] }))} value={habit.days} onChange={(days) => onChange({ days })} />

      {unmet && <Unmet unmet={unmet} />}
    </article>
  );
}

function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <span className="w-14 shrink-0 text-sm font-bold">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn('h-9 rounded-chip px-3 text-sm font-bold', option.value === value ? 'bg-ink text-on-ink' : 'bg-paper ring-1 ring-line hover:bg-paper-3')}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Unmet({ unmet }: { readonly unmet: UnmetHabitRequirement }) {
  const openPhone = useUi((state) => state.openPhone);
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-chip bg-danfo-soft px-3 py-2 text-sm font-bold text-[#7a5600]">
      <span className="flex-1">{unmet.message} — the autopilot skips it until then.</span>
      {unmet.fix === 'shop' && (
        <Button size="sm" variant="ink" icon={<ShoppingBag size={14} aria-hidden />} onClick={() => openPhone('shop')}>
          Open Shop
        </Button>
      )}
    </p>
  );
}

function HabitPicker({
  taken,
  subject,
  onPick,
  onCancel,
}: {
  readonly taken: readonly HabitActionId[];
  readonly subject: HabitSubject;
  readonly onPick: (actionId: HabitActionId) => void;
  readonly onCancel: () => void;
}) {
  const openPhone = useUi((state) => state.openPhone);
  return (
    <div className="flex flex-col gap-2 rounded-card border-2 border-dashed border-line p-2.5">
      <p className="px-1 text-sm font-bold">Pick a habit</p>
      <ul className="flex flex-col gap-1.5">
        {HABIT_ACTIONS.filter((id) => !taken.includes(id)).map((id) => {
          const action = findAction(id);
          const unmet = unmetHabitRequirement(id, subject);
          if (!action) return null;
          return (
            <li key={id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPick(id)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-card bg-paper-2 px-3 py-2.5 text-left hover:bg-paper-3"
              >
                <span aria-hidden className="text-2xl">
                  {action.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block font-bold">{action.label}</span>
                  <span className={cn('block truncate text-xs', unmet ? 'font-bold text-[#7a5600]' : 'text-text-soft')}>{unmet ? unmet.message : HABIT_BUILDS[id]}</span>
                </span>
              </button>
              {unmet?.fix === 'shop' && (
                <Button size="sm" variant="paper" aria-label={`Shop for ${action.label}`} icon={<ShoppingBag size={14} aria-hidden />} onClick={() => openPhone('shop')}>
                  Shop
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" size="sm" className="self-end text-text-soft hover:bg-paper-2" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
