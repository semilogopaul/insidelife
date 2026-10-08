import { Heart, Users } from 'lucide-react';
import { RELATIONSHIP_KIND_LABELS, isFamilyKind, isRomanticKind, type RelationshipDto } from '@insidelife/shared';
import { Badge, EmptyState } from '@/common/components';
import { PersonAvatar } from './PersonAvatar';

const GROUPS: ReadonlyArray<{ readonly title: string; readonly match: (rel: RelationshipDto) => boolean }> = [
  { title: 'Your person', match: (rel) => isRomanticKind(rel.kind) },
  { title: 'Family', match: (rel) => isFamilyKind(rel.kind) },
  { title: 'Friends', match: (rel) => rel.kind === 'friend' },
  { title: 'People you’ve met', match: (rel) => rel.kind === 'acquaintance' },
  { title: 'Exes', match: (rel) => rel.kind === 'ex' },
];

/** Everyone in your life, grouped, with closeness (and romance when there's a spark). */
export function PeopleList({ relationships, onOpen }: { readonly relationships: readonly RelationshipDto[]; readonly onOpen: (id: string) => void }) {
  if (relationships.length === 0) {
    return <EmptyState icon={Users} title="Nobody yet" body="Go out and mingle — bukas, bars and church are full of people to meet." />;
  }
  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((group) => {
        const people = relationships.filter(group.match).toSorted((a, b) => Number(b.alive) - Number(a.alive) || b.closeness - a.closeness);
        if (people.length === 0) return null;
        return (
          <section key={group.title} aria-label={group.title} className="flex flex-col gap-1.5">
            <h3 className="type-title text-lg">{group.title}</h3>
            <ul className="flex flex-col gap-1">
              {people.map((rel) => (
                <li key={rel.id}>
                  <PersonRow rel={rel} onOpen={() => onOpen(rel.id)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function PersonRow({ rel, onOpen }: { readonly rel: RelationshipDto; readonly onOpen: () => void }) {
  const romantic = rel.romance > 0 && !isFamilyKind(rel.kind);
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-card bg-paper-2 px-2.5 py-2 text-left hover:bg-paper-3">
      <PersonAvatar firstName={rel.firstName} lastName={rel.lastName} kind={rel.kind} closeness={rel.alive ? rel.closeness : undefined} alive={rel.alive} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-bold">
            {rel.firstName} {rel.lastName}
          </span>
          {rel.isPlayer && <Badge tone="info">Player</Badge>}
          {!rel.alive && <Badge>Late</Badge>}
        </span>
        <span className="block truncate text-xs text-text-soft">
          {RELATIONSHIP_KIND_LABELS[rel.kind]}
          {rel.alive ? `, ${rel.age}` : ''}
          {rel.metAt && !isFamilyKind(rel.kind) ? ` — met at ${rel.metAt.label}` : rel.occupation ? ` — ${rel.occupation}` : ''}
        </span>
      </span>
      {rel.alive && (
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-2xs font-bold text-text-soft">
          <span className="tabular">{Math.round(rel.closeness)} close</span>
          {romantic && (
            <span className="tabular flex items-center gap-0.5 text-ankara">
              <Heart size={10} aria-hidden className="fill-current" />
              {Math.round(rel.romance)}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
