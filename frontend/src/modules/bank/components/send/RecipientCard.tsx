import { BadgeCheck } from 'lucide-react';
import type { PlayerCardDto, PlayerProfileDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { initials } from '../../services/handles';

type Person = Pick<PlayerCardDto, 'handle' | 'firstName' | 'lastName' | 'statusTier' | 'title' | 'online'>;

/** Monogram disc standing in for an avatar (identity is name + handle + status). */
export function Monogram({ person, size = 'md' }: { readonly person: Pick<Person, 'firstName' | 'lastName' | 'online'>; readonly size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full bg-lagoon font-display font-extrabold text-white',
        size === 'lg' ? 'size-16 text-2xl' : size === 'md' ? 'size-11 text-base' : 'size-8 text-xs',
      )}
    >
      {initials(person.firstName, person.lastName)}
      {person.online && <span className={cn('absolute bottom-0 right-0 rounded-full bg-naira ring-2 ring-paper', size === 'lg' ? 'size-4' : 'size-3')} />}
    </span>
  );
}

/** "Is this who you're paying?" — the identity check before any amount is typed. */
export function RecipientCard({ person }: { readonly person: Person | PlayerProfileDto }) {
  return (
    <div className="flex items-center gap-4 rounded-sheet bg-paper-2 p-4 ring-1 ring-line">
      <Monogram person={person} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="type-title truncate text-xl leading-tight">
          {person.firstName} {person.lastName}
        </p>
        <p className="truncate text-sm font-bold text-text-soft">@{person.handle}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-soft">
          <span className="inline-flex items-center gap-1 rounded-chip bg-paper px-1.5 py-0.5 font-bold text-text ring-1 ring-line">
            <BadgeCheck size={12} aria-hidden className="text-lagoon" />
            {person.statusTier.label}
          </span>
          {person.title && <span className="truncate">{person.title}</span>}
          {person.online && <span className="font-bold text-naira">Online now</span>}
        </p>
      </div>
    </div>
  );
}
