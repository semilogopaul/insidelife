'use client';

import { cn } from '@/common/utils/cn';
import type { NightOutPerson } from '../../services/night-out';
import { PlayerAvatar } from '../PlayerAvatar';

export interface PeoplePickerProps {
  readonly label: string;
  readonly people: readonly NightOutPerson[];
  /** Selected handle; null = "Me" when `allowMe`. */
  readonly selected: string | null;
  readonly onSelect: (handle: string | null) => void;
  /** Offer "Me" first (a birthday can be yours). */
  readonly allowMe?: boolean;
  readonly empty: string;
}

/** Who it's for: the people in the room as radio chips (friends tagged). */
export function PeoplePicker({ label, people, selected, onSelect, allowMe = false, empty }: PeoplePickerProps) {
  if (people.length === 0 && !allowMe) return <p className="rounded-card bg-paper p-3 text-sm text-text-soft ring-1 ring-line">{empty}</p>;
  const chip = (checked: boolean) => cn('flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold ring-1', checked ? 'bg-danfo text-ink ring-danfo-deep' : 'bg-paper text-text ring-line hover:bg-paper-3');
  return (
    <div>
      <p className="text-sm font-bold">{label}</p>
      <ul role="radiogroup" aria-label={label} className="-mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {allowMe && (
          <li>
            <button type="button" role="radio" aria-checked={selected === null} onClick={() => onSelect(null)} className={chip(selected === null)}>
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-ink text-xs text-on-ink">
                ME
              </span>
              Me
            </button>
          </li>
        )}
        {people.map((person) => (
          <li key={person.handle}>
            <button type="button" role="radio" aria-checked={selected === person.handle} onClick={() => onSelect(person.handle)} className={chip(selected === person.handle)}>
              <PlayerAvatar name={`${person.firstName} ${person.lastName}`} handle={person.handle} size="sm" />
              {person.firstName}
              {person.isFriend && <span className="text-2xs opacity-70">friend</span>}
            </button>
          </li>
        ))}
      </ul>
      {people.length === 0 && <p className="mt-1 text-xs text-text-soft">{empty}</p>}
    </div>
  );
}
