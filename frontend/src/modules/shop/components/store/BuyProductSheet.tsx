'use client';

import { useState } from 'react';
import {
  PANTRY_MAX_MEALS, STORE_TIER_LABELS, findVenue, type ShopProductDto } from '@insidelife/shared';
import { Button, Money, Sheet } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useShopCommands } from '../../hooks/use-shop';
import { announce, complain } from '@/common/game/feedback';
import { maxBuyable, productPerks, purchaseLines, unlocksFor } from '../../services/shop-rules';
import { ClothSwatch } from '../ClothSwatch';
import { GoThere } from '@/common/components';
import { Receipt } from '@/common/components';
import { Stepper } from '@/common/components';

/** Confirm a purchase: quantity, the receipt (with delivery when online), where to buy it in person instead. */
export function BuyProductSheet({
  product,
  onClose,
}: {
  readonly product: ShopProductDto | null;
  readonly onClose: () => void;
}) {
  return (
    <Sheet
      open={product !== null}
      onClose={onClose}
      title={product?.name ?? ''}
      description={
        product
          ? (product.item?.blurb ?? `${STORE_TIER_LABELS[product.store]} · ${product.clothing?.slot ?? ''}`)
          : undefined
      }
    >
      {product && <BuyForm key={product.id} product={product} onDone={onClose} />}
    </Sheet>
  );
}

function BuyForm({ product, onDone }: { readonly product: ShopProductDto; readonly onDone: () => void }) {
  const { purchase } = useShopCommands();
  const { data: snapshot } = useSnapshot();
  // Groceries are limited by room in the kitchen, not by how many you own.
  const meals = product.item?.meals;
  const pantryRoom = meals ? Math.floor((PANTRY_MAX_MEALS - (snapshot?.summary.pantryMeals ?? 0)) / meals) : Infinity;
  const limit = Math.min(maxBuyable(product), pantryRoom);
  const [quantity, setQuantity] = useState(1);
  const { lines, total } = purchaseLines(product, quantity);
  const short = snapshot ? total - snapshot.wallet.balance : 0;
  const unlocks = product.item ? unlocksFor(product.item) : [];
  const shop = findVenue(product.soldAt[0] ?? '');

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex items-center gap-3">
        {product.clothing ? (
          <ClothSwatch clothing={product.clothing} className="size-16 shrink-0" />
        ) : (
          <span
            aria-hidden
            className="grid size-16 shrink-0 place-items-center rounded-card bg-paper-2 text-4xl"
          >
            {product.item?.emoji}
          </span>
        )}
        <div className="flex min-w-0 flex-wrap gap-1.5 text-xs">
          {productPerks(product).map((perk) => (
            <span key={perk} className="rounded-chip bg-paper-2 px-2 py-1 font-bold">
              {perk}
            </span>
          ))}
          {unlocks.map((unlock) => (
            <span key={unlock} className="rounded-chip bg-cobalt-soft px-2 py-1 font-bold text-cobalt">
              Unlocks: {unlock}
            </span>
          ))}
        </div>
      </div>
      {limit > 1 && (
        <Stepper
          label="Quantity"
          value={Math.min(quantity, limit)}
          min={1}
          max={limit}
          onChange={setQuantity}
        />
      )}
      <Receipt
        lines={lines}
        total={{ label: product.inStoreHere ? 'Pay at the till' : 'Pay now', amount: total }}
        caption={
          product.inStoreHere
            ? 'You’re in a store that stocks it: take it home today.'
            : 'Ordered online: arrives at your place next game day.'
        }
      />
      {!product.inStoreHere && shop && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-text-soft">
            Skip the delivery fee — in stock at{' '}
            {product.soldAt.map((id) => findVenue(id)?.name ?? id).join(', ')}.
          </p>
          <GoThere venueId={shop.id} venueName={shop.name} />
        </div>
      )}
      {limit === 0 && (
        <p className="text-sm font-bold text-text-soft">You already have as many as you need.</p>
      )}
      {short > 0 && limit > 0 && (
        <p className="text-sm font-bold text-okada">
          You’re short by <Money amount={short} />.
        </p>
      )}
      <Button
        size="lg"
        block
        disabled={limit === 0 || short > 0}
        loading={purchase.isPending}
        onClick={() =>
          purchase.mutate(
            { itemId: product.id, quantity: Math.min(quantity, limit) },
            {
              onSuccess: (result) => {
                announce(result.order.channel === 'in-store' ? 'Bought! 🛍️' : 'Order placed', {
                  body:
                    result.order.channel === 'in-store'
                      ? `${product.name} is yours.`
                      : `${product.name} arrives next game day.`,
                  amount: -result.order.total,
                });
                onDone();
              },
              onError: (error) => complain('Purchase didn’t go through', error),
            },
          )
        }
      >
        {product.inStoreHere ? 'Buy' : 'Order'} · <Money amount={total} />
      </Button>
    </div>
  );
}
