'use client';

import { Shirt } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ClothingDefinition, ClothingSlot, Outfit, WardrobeItemDto } from '@insidelife/shared';
import { ApiError, errorMessage } from '@/common/api/api-error';
import { Button, EmptyState } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { cn } from '@/common/utils/cn';
import { useDress, useWardrobe } from '../../hooks/use-shop';
import { announce } from '@/common/game/feedback';
import {
  DRESSING_ORDER,
  SLOT_LABELS,
  outfitClout,
  outfitProblems,
  sameOutfit,
  setSlot,
} from '../../services/shop-rules';
import { ClothSwatch } from '../ClothSwatch';
import { ErrorState, LoadingRows } from '@/common/components';
import { MirrorFrame } from './MirrorFrame';

/** Pick what to wear slot by slot, see it on your avatar, save. Rule: a full outfit, or a top and a bottom. */
export function WardrobeTab({ onShopClothes }: { readonly onShopClothes: () => void }) {
  const query = useWardrobe();
  const dress = useDress();
  const { data: snapshot } = useSnapshot();
  const [draft, setDraft] = useState<Outfit | null>(null);
  const [serverErrors, setServerErrors] = useState<readonly string[]>([]);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const bySlot = useMemo(() => {
    const groups = new Map<ClothingSlot, WardrobeItemDto[]>();
    for (const item of items)
      groups.set(item.clothing.slot, [...(groups.get(item.clothing.slot) ?? []), item]);
    return groups;
  }, [items]);

  if (query.isPending) return <LoadingRows rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (items.length === 0)
    return (
      <EmptyState
        icon={Shirt}
        title="Empty wardrobe"
        body="Buy some clothes — okrika is cheap and still fresh."
        action={<Button onClick={onShopClothes}>Shop clothes</Button>}
      />
    );

  const saved = query.data.outfit;
  const current = draft ?? saved;
  const dirty = draft !== null && !sameOutfit(draft, saved);
  const problems = outfitProblems(current);
  const lookup = (id: string): ClothingDefinition | undefined =>
    items.find((item) => item.clothing.id === id)?.clothing;
  const clout = outfitClout(current, lookup);

  const choose = (slot: ClothingSlot, itemId: string | null): void => {
    let next = setSlot(current, slot, itemId);
    if (slot === 'full' && itemId !== null) next = setSlot(setSlot(next, 'top', null), 'bottom', null);
    if ((slot === 'top' || slot === 'bottom') && itemId !== null) next = setSlot(next, 'full', null);
    setDraft(next);
    setServerErrors([]);
  };

  const save = (): void =>
    dress.mutate(current, {
      onSuccess: (wardrobe) => {
        setDraft(null);
        setServerErrors([]);
        announce('Outfit saved', {
          body:
            wardrobe.outfitStatus > 0
              ? `Drip level: +${wardrobe.outfitStatus} clout. People go look.`
              : 'Clean and simple.',
          sfx: 'ui-success',
        });
      },
      onError: (error) =>
        setServerErrors(
          error instanceof ApiError && error.details.length > 0 ? error.details : [errorMessage(error)],
        ),
    });

  return (
    <div className="flex flex-col gap-5">
      {snapshot && (
        <MirrorFrame
          appearance={snapshot.character.appearance}
          outfit={current}
          mood={snapshot.character.mood}
          caption={
            <>
              <span className="text-sm font-bold">{dirty ? 'Trying on' : 'Wearing now'}</span>
              <span className="type-figure text-lg text-danfo">+{clout} clout</span>
            </>
          }
        />
      )}

      <ul className="flex flex-col gap-4">
        {DRESSING_ORDER.map((slot) => {
          const owned = bySlot.get(slot) ?? [];
          const hidden = current.full !== undefined && (slot === 'top' || slot === 'bottom');
          const selected = current[slot] ?? null;
          return (
            <li key={slot} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="font-bold">{SLOT_LABELS[slot]}</h4>
                <span className="truncate text-xs text-text-soft">
                  {hidden
                    ? `Covered by your ${lookup(current.full ?? '')?.name ?? 'outfit'}`
                    : selected
                      ? lookup(selected)?.name
                      : 'Nothing'}
                </span>
              </div>
              {owned.length === 0 ? (
                <button
                  type="button"
                  onClick={onShopClothes}
                  className="self-start text-sm font-bold text-cobalt hover:underline"
                >
                  No {SLOT_LABELS[slot].toLowerCase()} yet — shop
                </button>
              ) : (
                <div
                  role="radiogroup"
                  aria-label={SLOT_LABELS[slot]}
                  className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                >
                  <SlotOption
                    label="None"
                    selected={selected === null}
                    dimmed={hidden}
                    onSelect={() => choose(slot, null)}
                  />
                  {owned.map((item) => (
                    <SlotOption
                      key={item.inventoryId}
                      label={item.clothing.name}
                      clothing={item.clothing}
                      selected={selected === item.clothing.id}
                      dimmed={hidden}
                      onSelect={() => choose(slot, item.clothing.id)}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {(problems.length > 0 || serverErrors.length > 0) && (
        <ul
          role="alert"
          className="flex flex-col gap-1 rounded-card bg-okada-soft p-3 text-sm font-bold text-okada"
        >
          {[...problems, ...serverErrors].map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-line bg-paper px-5 pt-3">
        <Button variant="paper" disabled={!dirty || dress.isPending} onClick={() => setDraft(null)}>
          Reset
        </Button>
        <Button
          className="flex-1"
          disabled={!dirty || problems.length > 0}
          loading={dress.isPending}
          onClick={save}
        >
          Wear this
        </Button>
      </div>
    </div>
  );
}

function SlotOption({
  label,
  clothing,
  selected,
  dimmed,
  onSelect,
}: {
  readonly label: string;
  readonly clothing?: ClothingDefinition;
  readonly selected: boolean;
  readonly dimmed: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-24 shrink-0 flex-col gap-1.5 rounded-card p-1.5 text-left ring-2 transition',
        selected ? 'bg-danfo-soft ring-danfo' : 'bg-paper-2 ring-transparent hover:ring-line',
        dimmed && !selected && 'opacity-50',
      )}
    >
      {clothing ? (
        <ClothSwatch clothing={clothing} className="aspect-square w-full" />
      ) : (
        <span
          aria-hidden
          className="grid aspect-square w-full place-items-center rounded-card bg-paper text-2xl text-text-faint ring-1 ring-line"
        >
          ∅
        </span>
      )}
      <span className="line-clamp-2 text-xs font-bold leading-tight">{label}</span>
    </button>
  );
}
