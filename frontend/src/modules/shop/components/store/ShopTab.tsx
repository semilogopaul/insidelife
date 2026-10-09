'use client';

import { Store, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  SHOP_CATEGORIES,
  SHOP_CATEGORY_LABELS,
  STORE_TIERS,
  STORE_TIER_LABELS,
  type ShopCategory,
  type ShopProductDto,
  type StoreTier,
} from '@insidelife/shared';
import { Badge, Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useCatalogue } from '../../hooks/use-shop';
import { filterProducts, productPerks, unlocksFor } from '../../services/shop-rules';
import { ClothSwatch } from '../ClothSwatch';
import { FilterChips } from '@/common/components';
import { ErrorState, LoadingRows } from '@/common/components';
import { BuyProductSheet } from './BuyProductSheet';

const SHORT_CATEGORY: Record<ShopCategory, string> = {
  furniture: 'Furniture',
  appliances: 'Appliances',
  electronics: 'TV & gaming',
  power: 'Power',
  phones: 'Phones',
  computers: 'Laptops',
  essentials: 'Essentials',
  groceries: 'Groceries',
  clothing: 'Clothes',
};

/** Browse by category (clothes by store tier), see what each thing does for you, buy in store or for delivery. */
export function ShopTab({ initialCategory }: { readonly initialCategory: ShopCategory }) {
  const query = useCatalogue();
  const [category, setCategory] = useState<ShopCategory>(initialCategory);
  const [tier, setTier] = useState<StoreTier | 'all'>('all');
  const [hereOnly, setHereOnly] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const products = useMemo(() => query.data?.products ?? [], [query.data]);
  const venue = query.data?.venue ?? null;
  const inStore = venue?.here === true && venue.label !== null;
  const visible = useMemo(
    () => filterProducts(products, { category, tier, hereOnly: inStore && hereOnly }),
    [products, category, tier, hereOnly, inStore],
  );

  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const buying: ShopProductDto | null = products.find((product) => product.id === buyingId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <p
        className={cn(
          'flex items-start gap-2.5 rounded-card p-3 text-sm',
          inStore ? 'bg-naira-soft' : 'bg-paper-2',
        )}
      >
        {inStore ? (
          <Store size={18} aria-hidden className="mt-0.5 shrink-0 text-naira" />
        ) : (
          <Truck size={18} aria-hidden className="mt-0.5 shrink-0 text-lagoon" />
        )}
        <span>
          {inStore && venue ? (
            <>
              You’re at <strong>{venue.name}</strong> — {venue.label}. Things on these shelves are yours
              today, no delivery fee.
            </>
          ) : (
            <>
              <strong>Ordering online</strong> adds 10% delivery and arrives next game day. Shop in person at
              a market or mall to skip the fee.
            </>
          )}
        </span>
      </p>

      <div className="flex flex-col gap-2">
        <FilterChips
          label="Category"
          value={category}
          onChange={setCategory}
          options={SHOP_CATEGORIES.map((id) => ({ id, label: SHORT_CATEGORY[id] }))}
        />
        {category === 'clothing' && (
          <FilterChips
            label="Store"
            value={tier}
            onChange={setTier}
            options={[
              { id: 'all', label: 'All stores' },
              ...STORE_TIERS.map((id) => ({ id, label: STORE_TIER_LABELS[id] })),
            ]}
          />
        )}
        {inStore && (
          <FilterChips
            label="Availability"
            value={hereOnly ? 'here' : 'all'}
            onChange={(value) => setHereOnly(value === 'here')}
            options={[
              { id: 'all', label: 'Everything' },
              { id: 'here', label: 'On these shelves' },
            ]}
          />
        )}
      </div>

      <h3 className="type-title text-lg">{SHOP_CATEGORY_LABELS[category]}</h3>
      {visible.length === 0 ? (
        <p className="rounded-card bg-paper-2 p-4 text-center text-sm text-text-soft">
          Nothing here on these shelves. Try “Everything” to order online.
        </p>
      ) : (
        <ul className={cn('grid gap-2.5', category === 'clothing' ? 'grid-cols-2' : 'grid-cols-1')}>
          {visible.map((product) =>
            product.clothing ? (
              <ClothingCard key={product.id} product={product} onOpen={() => setBuyingId(product.id)} />
            ) : (
              <ItemRow key={product.id} product={product} onOpen={() => setBuyingId(product.id)} />
            ),
          )}
        </ul>
      )}
      <BuyProductSheet product={buying} onClose={() => setBuyingId(null)} />
    </div>
  );
}

function ItemRow({ product, onOpen }: { readonly product: ShopProductDto; readonly onOpen: () => void }) {
  const unlocks = product.item ? unlocksFor(product.item) : [];
  const perks = productPerks(product);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 rounded-card bg-paper-2 p-3 text-left ring-1 ring-transparent hover:ring-line"
      >
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-card bg-paper text-3xl">
          {product.item?.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="font-bold leading-tight">{product.name}</span>
            <span className="shrink-0 text-right leading-tight">
              <Money amount={product.price} compact className="font-bold" />
              {!product.inStoreHere && (
                <span className="block text-2xs text-text-soft">
                  +<Money amount={product.deliveryFee} compact /> delivery
                </span>
              )}
            </span>
          </span>
          <span className="mt-0.5 block text-sm text-text-soft">{product.item?.blurb}</span>
          {(unlocks.length > 0 || perks.length > 0 || product.owned > 0 || product.inStoreHere) && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {product.inStoreHere && <Badge tone="good">On this shelf</Badge>}
              {product.owned > 0 && <Badge tone="info">You have {product.owned}</Badge>}
              {unlocks.map((unlock) => (
                <Badge key={unlock} tone="info">
                  Unlocks: {unlock}
                </Badge>
              ))}
              {perks.map((perk) => (
                <Badge key={perk}>{perk}</Badge>
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function ClothingCard({
  product,
  onOpen,
}: {
  readonly product: ShopProductDto;
  readonly onOpen: () => void;
}) {
  const clothing = product.clothing;
  if (!clothing) return null;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col gap-2 rounded-card bg-paper-2 p-2.5 text-left ring-1 ring-transparent hover:ring-line"
      >
        <ClothSwatch clothing={clothing} className="aspect-[4/3] w-full" />
        <span className="line-clamp-2 text-sm font-bold leading-tight">{product.name}</span>
        <span className="mt-auto flex items-end justify-between gap-1">
          <span className="text-xs text-text-soft">
            {STORE_TIER_LABELS[product.store].split(' ')[0]}
            {product.status > 0 && ` · +${product.status} clout`}
          </span>
          <Money amount={product.price} compact className="text-sm font-bold" />
        </span>
        {product.owned > 0 && <Badge tone="info">Owned</Badge>}
      </button>
    </li>
  );
}
