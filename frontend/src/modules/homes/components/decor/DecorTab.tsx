'use client';

import { Sofa } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DECOR_CATEGORIES, homeLocationId, type DecorCategory, type DecorItem } from '@insidelife/shared';
import { Badge, Button, EmptyState, ErrorState, FilterChips, LoadingRows, Money } from '@/common/components';
import { useDecor, useDecorEdit } from '@/common/decor';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { ownedCounts, PLACEMENT_LABEL, shelf, summarise, TIER_LABEL } from '../../services/decor-rules';
import { BuyDecorSheet } from './BuyDecorSheet';

const TIER_TONE = { budget: 'neutral', standard: 'info', premium: 'ankara', luxury: 'warn' } as const;

/** The Decor store: rugs, beds, plants, aquariums, art, lamps, cushions, shelves, mirrors and tables for the rooms of your home. */
export function DecorTab() {
  const query = useDecor();
  const snapshot = useSnapshot().data;
  const closePhone = useUi((state) => state.closePhone);
  const [category, setCategory] = useState<DecorCategory>('rugs');
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const prices = query.data?.prices;
  const items = useMemo(() => (prices ? shelf(category, prices) : []), [category, prices]);
  const counts = useMemo(() => ownedCounts(query.data?.pieces ?? []), [query.data]);

  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const { prices: priceList, pieces, home } = query.data;
  const summary = summarise(pieces);
  const atHome = snapshot !== undefined && snapshot.character.locationId === homeLocationId(snapshot.character.id);
  const buying = items.find((item) => item.id === buyingId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-card bg-paper-2 p-3">
        <p className="text-sm">
          <strong>{summary.total === 0 ? 'No decor yet' : `${summary.total} ${summary.total === 1 ? 'piece' : 'pieces'}`}</strong>
          {summary.total > 0 && (
            <span className="text-text-soft">
              {' '}
              · {summary.placed} on display, {summary.stored} in storage
            </span>
          )}
        </p>
        {!home.eligible ? (
          <p className="text-sm text-text-soft">{home.reason} Rent or buy your own place and it’s yours to dress.</p>
        ) : atHome ? (
          <Button
            block
            onClick={() => {
              closePhone();
              useDecorEdit.getState().enter();
            }}
          >
            Decorate this room
          </Button>
        ) : (
          <p className="text-sm text-text-soft">Buy here, then go home and tap Decorate to put things where you want them. Visitors will see them.</p>
        )}
      </section>

      <FilterChips
        label="Decor category"
        value={category}
        onChange={setCategory}
        options={DECOR_CATEGORIES.map((entry) => ({ id: entry.id, label: `${entry.emoji} ${entry.label}` }))}
      />

      {items.length === 0 ? (
        <EmptyState icon={Sofa} title="Nothing on this shelf" body="Try another category." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <DecorCard item={item} price={priceList[item.id] ?? item.price} owned={counts.get(item.id) ?? 0} onOpen={() => setBuyingId(item.id)} />
            </li>
          ))}
        </ul>
      )}
      <BuyDecorSheet item={buying} price={buying ? (priceList[buying.id] ?? buying.price) : 0} owned={buying ? (counts.get(buying.id) ?? 0) : 0} total={summary.total} onClose={() => setBuyingId(null)} />
    </div>
  );
}

function DecorCard({ item, price, owned, onOpen }: { readonly item: DecorItem; readonly price: number; readonly owned: number; readonly onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-card bg-paper p-3 text-left ring-1 ring-line hover:bg-paper-2">
      <span aria-hidden className="mt-0.5 flex shrink-0 -space-x-2">
        {item.variants.slice(0, 3).map((variant) => (
          <span key={variant.id} className="size-7 rounded-full border-2 border-paper" style={{ background: variant.hex, boxShadow: `inset 0 0 0 3px ${variant.accent}` }} />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <strong className="text-sm">{item.name}</strong>
          <Badge tone={TIER_TONE[item.tier]}>{TIER_LABEL[item.tier]}</Badge>
          {item.nigerian && <Badge tone="good">Made in Naija</Badge>}
        </span>
        <span className="mt-0.5 block text-xs text-text-soft">{item.blurb}</span>
        <span className="mt-1 block text-xs text-text-soft">
          {PLACEMENT_LABEL[item.placement]} · {item.variants.length} finishes
          {owned > 0 ? ` · you have ${owned}` : ''}
        </span>
      </span>
      <Money amount={price} compact className="shrink-0 text-sm font-bold" />
    </button>
  );
}
