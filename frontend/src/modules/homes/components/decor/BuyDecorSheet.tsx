'use client';

import { useState } from 'react';
import { DECOR_MAX_OWNED, type DecorItem } from '@insidelife/shared';
import { Button, Money, Receipt, Sheet, Stepper } from '@/common/components';
import { useDecorCommands } from '@/common/decor';
import { announce, complain } from '@/common/game/feedback';
import { useSnapshot } from '@/common/game/snapshot';
import { cn } from '@/common/utils/cn';
import { maxBuyable, PLACEMENT_LABEL } from '../../services/decor-rules';

/** Pick a finish and a quantity, see the bill, buy: the piece is in your decor inventory at once. */
export function BuyDecorSheet({
  item,
  price,
  owned,
  total,
  onClose,
}: {
  readonly item: DecorItem | null;
  readonly price: number;
  readonly owned: number;
  /** Everything you own (for the collection cap). */
  readonly total: number;
  readonly onClose: () => void;
}) {
  return (
    <Sheet open={item !== null} onClose={onClose} title={item?.name ?? ''} description={item?.blurb}>
      {item && <BuyForm key={item.id} item={item} price={price} owned={owned} total={total} onDone={onClose} />}
    </Sheet>
  );
}

function BuyForm({ item, price, owned, total, onDone }: { readonly item: DecorItem; readonly price: number; readonly owned: number; readonly total: number; readonly onDone: () => void }) {
  const { purchase } = useDecorCommands();
  const { data: snapshot } = useSnapshot();
  const [variantId, setVariantId] = useState(item.variants[0]!.id);
  const [quantity, setQuantity] = useState(1);
  const limit = maxBuyable(total);
  const count = Math.min(quantity, Math.max(1, limit));
  const bill = price * count;
  const short = snapshot ? bill - snapshot.wallet.balance : 0;
  const variant = item.variants.find((candidate) => candidate.id === variantId) ?? item.variants[0]!;

  return (
    <div className="flex flex-col gap-4 pb-2">
      <p className="text-sm text-text-soft">
        {PLACEMENT_LABEL[item.placement]} · about {item.footprint[0]} × {item.footprint[1]} m
        {owned > 0 ? ` · you have ${owned}` : ''}
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">
          Finish: <span className="font-normal">{variant.label}</span>
        </legend>
        <ul className="flex flex-wrap gap-2">
          {item.variants.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                aria-label={option.label}
                aria-pressed={option.id === variantId}
                onClick={() => setVariantId(option.id)}
                className={cn('size-11 rounded-full border-4', option.id === variantId ? 'border-ink' : 'border-paper ring-1 ring-line')}
                style={{ background: option.hex, boxShadow: `inset 0 0 0 4px ${option.accent}` }}
              />
            </li>
          ))}
        </ul>
      </fieldset>
      {limit > 1 && <Stepper label="Quantity" value={count} min={1} max={limit} onChange={setQuantity} />}
      <Receipt
        lines={[{ label: `${count > 1 ? `${count} × ` : ''}${item.name} (${variant.label})`, amount: bill }]}
        total={{ label: 'Pay now', amount: bill }}
        caption="Delivered to your decor inventory straight away. Place it from any room of your home in Decorate mode."
      />
      {limit === 0 && <p className="text-sm font-bold text-text-soft">You already own {DECOR_MAX_OWNED} pieces — that’s a lot to look after.</p>}
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
            { itemId: item.id, variant: variant.id, quantity: count },
            {
              onSuccess: (result) => {
                announce('Decor delivered', { body: `${count > 1 ? `${count} × ` : ''}${item.name} (${variant.label}) is in your decor inventory.`, amount: -result.total });
                onDone();
              },
              onError: (error) => complain('Purchase didn’t go through', error),
            },
          )
        }
      >
        Buy · <Money amount={bill} />
      </Button>
    </div>
  );
}
