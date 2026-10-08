'use client';

import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CharacterDto } from '@insidelife/shared';
import { Spinner } from '@/common/components';
import { useMyProfile } from '../hooks/use-me';

const initials = (first: string, last: string): string => `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();

/** How Lagos sees you: name, @handle, status tier, title, badges and your self-made band. */
export function ProfileCard({ character }: { readonly character: CharacterDto }) {
  const profile = useMyProfile(character.handle);
  const data = profile.data;
  return (
    <section aria-label="Your profile" className="relative overflow-hidden rounded-card bg-ink text-on-ink">
      <div className="flex items-start gap-3.5 p-4">
        <span className="relative grid size-16 shrink-0 place-items-center rounded-full bg-danfo text-ink ring-4 ring-danfo/25">
          <span className="type-title text-2xl">{initials(character.firstName, character.lastName)}</span>
          {data?.online && <span aria-hidden className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full bg-naira ring-2 ring-ink" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="type-title truncate text-2xl leading-tight">
            {character.firstName} {character.lastName}
          </h3>
          <p className="truncate text-sm text-on-ink-soft">@{character.handle}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-chip bg-danfo px-2 py-0.5 text-xs font-bold text-ink">{data?.statusTier.label ?? '…'}</span>
            <span className="rounded-chip bg-white/10 px-2 py-0.5 text-xs font-bold">Generation {character.generation}</span>
            <span className="rounded-chip bg-white/10 px-2 py-0.5 text-xs font-bold">{character.age} yrs</span>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px border-t border-white/10 bg-white/10 text-center">
        <Cell label="Title" value={data?.title ?? (profile.isPending ? '…' : 'Hustling')} />
        <Cell label="Self-made" value={data?.wealth.selfMadeBand ?? '…'} />
        <Cell
          label="Friends"
          value={
            data ? (
              <span className="inline-flex items-center gap-1">
                <Users size={14} aria-hidden />
                {data.friendCount}
              </span>
            ) : (
              '…'
            )
          }
        />
      </div>
      {profile.isPending && (
        <span className="absolute right-3 top-3 text-on-ink-soft">
          <Spinner size={14} />
        </span>
      )}
      {data && data.badges.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 border-t border-white/10 px-4 py-3" aria-label="Badges">
          {data.badges.map((badge) => (
            <li key={badge.id} className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-bold">
              <span aria-hidden>{badge.emoji}</span> {badge.label}
            </li>
          ))}
        </ul>
      )}
      <span aria-hidden className="block h-[9px] danfo-stripes [--color-ink:var(--color-danfo)]" />
    </section>
  );
}

function Cell({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="min-w-0 bg-ink px-2 py-2.5">
      <p className="text-2xs font-bold text-on-ink-soft">{label}</p>
      <p className="truncate text-sm font-bold">{value}</p>
    </div>
  );
}
