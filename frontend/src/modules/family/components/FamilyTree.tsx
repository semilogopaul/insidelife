import { Heart } from 'lucide-react';
import { RELATIONSHIP_KIND_LABELS, type CharacterDto, type FamilyTreeDto, type PersonDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { PersonAvatar } from './PersonAvatar';

export interface FamilyTreeProps {
  readonly tree: FamilyTreeDto;
  readonly me: CharacterDto;
  /** Open someone's sheet (relationship id). */
  readonly onOpen: (relationshipId: string) => void;
}

/** Three-to-four generations at a glance: elders, parents, you (with partner and siblings), children. */
export function FamilyTree({ tree, me, onOpen }: FamilyTreeProps) {
  const half = Math.ceil(tree.siblings.length / 2);
  const leftSiblings = tree.siblings.slice(0, half);
  const rightSiblings = tree.siblings.slice(half);
  return (
    <figure aria-label="Family tree" className="flex flex-col items-center rounded-card bg-paper-2 px-2 py-4">
      {tree.grandparents.length > 0 && (
        <>
          <Row label="Grandparents" people={tree.grandparents} onOpen={onOpen} size="sm" />
          <Connector />
        </>
      )}
      {tree.parents.length > 0 && (
        <>
          <Row label="Parents" people={tree.parents} onOpen={onOpen} />
          <Connector />
        </>
      )}
      <div className="flex max-w-full items-end justify-center gap-1 overflow-x-auto px-1 py-1.5">
        {leftSiblings.map((person) => (
          <Node key={person.id} person={person} onOpen={onOpen} size="sm" />
        ))}
        <div className="flex items-end gap-0.5 rounded-card bg-paper px-1.5 pb-1 pt-2 ring-1 ring-danfo">
          <div className="flex w-20 flex-col items-center gap-1 text-center">
            <PersonAvatar firstName={me.firstName} lastName={me.lastName} kind="self" size="lg" highlight />
            <span className="w-full truncate text-sm font-bold">You</span>
            <span className="text-2xs text-text-soft">{me.age} yrs</span>
          </div>
          {tree.partner && (
            <>
              <Heart size={16} aria-label="with" className="mb-9 shrink-0 fill-ankara text-ankara" />
              <Node person={tree.partner} onOpen={onOpen} />
            </>
          )}
        </div>
        {rightSiblings.map((person) => (
          <Node key={person.id} person={person} onOpen={onOpen} size="sm" />
        ))}
      </div>
      {tree.children.length > 0 && (
        <>
          <Connector />
          <Row label="Children" people={tree.children} onOpen={onOpen} />
        </>
      )}
      <figcaption className="sr-only">
        {tree.parents.length} parents, {tree.siblings.length} siblings, {tree.children.length} children{tree.partner ? `, partner ${tree.partner.firstName}` : ''}.
      </figcaption>
    </figure>
  );
}

function Connector() {
  return <span aria-hidden className="my-1.5 block h-5 w-0.5 rounded-full bg-line" />;
}

function Row({ label, people, onOpen, size = 'md' }: { readonly label: string; readonly people: readonly PersonDto[]; readonly onOpen: (id: string) => void; readonly size?: 'sm' | 'md' }) {
  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <span className="text-2xs font-bold text-text-faint">{label}</span>
      <ul className="flex max-w-full gap-1 overflow-x-auto px-1">
        {people.map((person) => (
          <li key={person.id}>
            <Node person={person} onOpen={onOpen} size={size} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Node({ person, onOpen, size = 'md' }: { readonly person: PersonDto; readonly onOpen: (id: string) => void; readonly size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(person.id)}
      aria-label={`${person.firstName} ${person.lastName}, ${RELATIONSHIP_KIND_LABELS[person.kind]}, ${person.alive ? `${person.age} years old, closeness ${Math.round(person.closeness)}` : 'late'}`}
      className={cn('flex flex-col items-center gap-1 rounded-card px-1 py-1.5 text-center hover:bg-paper-3', size === 'sm' ? 'w-16' : 'w-20')}
    >
      <PersonAvatar firstName={person.firstName} lastName={person.lastName} kind={person.kind} closeness={person.alive ? person.closeness : undefined} alive={person.alive} size={size} />
      <span className={cn('w-full truncate font-bold', size === 'sm' ? 'text-xs' : 'text-sm')}>{person.firstName}</span>
      <span className="text-2xs text-text-soft">{person.alive ? `${person.age} yrs` : 'Late'}</span>
    </button>
  );
}
