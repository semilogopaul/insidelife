import { Crown } from 'lucide-react';
import type { FamilyTreeDto } from '@insidelife/shared';

/** Who carries the family name if you die today. */
export function HeirCard({ tree }: { readonly tree: FamilyTreeDto }) {
  return (
    <section aria-label="Your heir" className="flex items-start gap-3 rounded-card bg-ink p-3.5 text-on-ink">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danfo text-ink">
        <Crown size={20} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-danfo">Generation {tree.generation}</p>
        {tree.heir ? (
          <>
            <p className="type-title text-lg leading-tight">
              {tree.heir.name}, {tree.heir.age}, is your heir
            </p>
            <p className="text-sm text-on-ink-soft">If you die today, they inherit what’s left and you continue as them.</p>
          </>
        ) : (
          <>
            <p className="type-title text-lg leading-tight">No heir yet</p>
            <p className="text-sm text-on-ink-soft">Without children, your story ends with you. Family is how a name outlives Lagos traffic.</p>
          </>
        )}
      </div>
    </section>
  );
}
