'use client';

import { Package, Truck, Wrench } from 'lucide-react';
import { useState } from 'react';
import {
  MAX_FURNITURE_COMFORT,
  SHOP_CATEGORY_LABELS,
  type GameMinute,
  type InventoryItemDto,
  type PowerBackupKind,
} from '@insidelife/shared';
import { Badge, Button, EmptyState, Money, ProgressBar, Section } from '@/common/components';
import { useInventory, useShopCommands } from '../../hooks/use-shop';
import { announce, complain } from '@/common/game/feedback';
import { gameDateTime } from '@/common/utils/game-time';
import { ClothSwatch } from '../ClothSwatch';
import { ConfirmSheet } from '@/common/components';
import { ErrorState, LoadingRows } from '@/common/components';

const BACKUP: Record<PowerBackupKind, string> = {
  none: 'None',
  generator: 'Generator',
  inverter: 'Inverter',
  solar: 'Solar',
};

type Pending = { readonly kind: 'sell' | 'repair'; readonly item: InventoryItemDto } | null;

/** Everything you own: any legacy deliveries, what your things do at home, and resell/repair. */
export function StuffTab({ now, onShop }: { readonly now: GameMinute; readonly onShop: () => void }) {
  const query = useInventory();
  const { sell, repair } = useShopCommands();
  const [pending, setPending] = useState<Pending>(null);
  if (query.isPending) return <LoadingRows />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const { items, deliveries, home } = query.data;
  const things = items.filter((item) => item.kind === 'item');
  const clothes = items.filter((item) => item.kind === 'clothing');

  return (
    <div className="flex flex-col gap-6">
      {deliveries.length > 0 && (
        <Section title="On the way">
          <ul className="flex flex-col gap-2">
            {deliveries.map((order) => (
              <li key={order.id} className="flex items-center gap-3 rounded-card bg-cobalt-soft p-3 text-sm">
                <Truck size={18} aria-hidden className="shrink-0 text-cobalt" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {order.quantity > 1 && `${order.quantity}× `}
                    {order.name}
                  </span>
                  <span className="block text-text-soft">
                    Arrives {order.arrivesAt !== null ? gameDateTime(order.arrivesAt, now) : 'soon'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="At home">
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-chip bg-paper-2 px-2.5 py-2">
            <dt className="text-xs font-bold text-text-soft">Comfort</dt>
            <dd className="type-figure text-lg">
              {home.comfort.toFixed(1)}
              <span className="text-xs text-text-soft">/{MAX_FURNITURE_COMFORT}</span>
            </dd>
          </div>
          <div className="rounded-chip bg-paper-2 px-2.5 py-2">
            <dt className="text-xs font-bold text-text-soft">Sleep</dt>
            <dd className="type-figure text-lg">{Math.round(home.bedQuality * 100)}%</dd>
          </div>
          <div className="rounded-chip bg-paper-2 px-2.5 py-2">
            <dt className="text-xs font-bold text-text-soft">Power</dt>
            <dd className="type-figure text-lg">{BACKUP[home.power]}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Your things" aside={`${things.length} item${things.length === 1 ? '' : 's'}`}>
        {things.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nothing yet"
            body="A fan, a TV, a generator — small things make home feel like home."
            action={<Button onClick={onShop}>Go shopping</Button>}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {things.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onSell={() => setPending({ kind: 'sell', item })}
                onRepair={() => setPending({ kind: 'repair', item })}
              />
            ))}
          </ul>
        )}
      </Section>

      {clothes.length > 0 && (
        <Section title="Clothes" aside={`${clothes.length} pieces`}>
          <ul className="flex flex-col gap-2">
            {clothes.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onSell={() => setPending({ kind: 'sell', item })}
                onRepair={() => setPending({ kind: 'repair', item })}
              />
            ))}
          </ul>
        </Section>
      )}

      <ConfirmSheet
        open={pending !== null}
        onClose={() => setPending(null)}
        tone={pending?.kind === 'sell' ? 'danger' : 'danfo'}
        title={
          pending
            ? pending.kind === 'sell'
              ? `Sell ${pending.item.name}?`
              : `Repair ${pending.item.name}?`
            : ''
        }
        description={
          pending?.kind === 'sell'
            ? 'Second-hand buyers pay a fraction of the shelf price, less for worn things.'
            : 'Back to full condition today.'
        }
        confirmLabel={pending?.kind === 'sell' ? 'Sell one' : 'Pay for the repair'}
        loading={sell.isPending || repair.isPending}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'sell') {
            sell.mutate(
              { inventoryId: pending.item.id, quantity: 1 },
              {
                onSuccess: (result) => {
                  setPending(null);
                  announce('Sold', { body: `${pending.item.name} has a new owner.`, amount: result.amount });
                },
                onError: (error) => complain('Couldn’t sell it', error),
              },
            );
          } else {
            repair.mutate(pending.item.id, {
              onSuccess: (result) => {
                setPending(null);
                announce('Fixed', {
                  body: `${pending.item.name} is working like new.`,
                  amount: -result.cost,
                });
              },
              onError: (error) => complain('Repair didn’t happen', error),
            });
          }
        }}
      >
        {pending && (
          <p className="rounded-card bg-paper-2 p-3 text-sm">
            {pending.kind === 'sell' ? 'Offer' : 'Cost'}:{' '}
            <Money
              amount={pending.kind === 'sell' ? pending.item.resaleOffer : (pending.item.repairCost ?? 0)}
              className="font-bold"
            />
          </p>
        )}
      </ConfirmSheet>
    </div>
  );
}

function ItemRow({
  item,
  onSell,
  onRepair,
}: {
  readonly item: InventoryItemDto;
  readonly onSell: () => void;
  readonly onRepair: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-card bg-paper-2 p-3">
      <div className="flex items-start gap-3">
        {item.clothing ? (
          <ClothSwatch clothing={item.clothing} className="size-10 shrink-0" />
        ) : (
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-card bg-paper text-2xl"
          >
            {item.item?.emoji}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight">
            {item.quantity > 1 && `${item.quantity}× `}
            {item.name}
          </p>
          <p className="text-xs text-text-soft">{SHOP_CATEGORY_LABELS[item.category]}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {item.equipped && <Badge tone="info">Wearing</Badge>}
          {item.faulty && <Badge tone="bad">Faulty</Badge>}
        </div>
      </div>
      {item.kind === 'item' && (
        <div className="flex items-center gap-2">
          <ProgressBar
            value={item.condition}
            label={`${item.name} condition`}
            tone={item.faulty ? 'okada' : item.condition < 60 ? 'danfo' : 'naira'}
            className="flex-1"
          />
          <span className="tabular w-9 text-right text-xs font-bold">{Math.round(item.condition)}%</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {item.repairCost !== null && (
          <Button size="sm" variant="ink" icon={<Wrench size={14} aria-hidden />} onClick={onRepair}>
            Repair · <Money amount={item.repairCost} compact />
          </Button>
        )}
        {!item.equipped && (
          <Button size="sm" variant="paper" onClick={onSell}>
            Sell · <Money amount={item.resaleOffer} compact />
          </Button>
        )}
      </div>
    </li>
  );
}
