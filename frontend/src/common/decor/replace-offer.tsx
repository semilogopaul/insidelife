'use client';

import { create } from 'zustand';
import { PackageOpen, Coins } from 'lucide-react';
import {
  DECOR_HOME_ROOMS,
  findDecorItem,
  formatNaira,
  FURNITURE_SELL_BACK_RATE,
  type DecorPieceDto,
  type FurniturePurchaseDto,
} from '@insidelife/shared';
import { Button, Sheet } from '@/common/components';
import { announce, complain } from '@/common/game/feedback';
import { useDecorCommands } from './use-decor';

/**
 * "Replace your old one?" — after buying a better bed, sofa or TV the older one of the same kind that stands in your
 * home is offered back: store it, sell it back, or keep both. The new piece takes the old one's place. Shown by whoever
 * made the purchase (the phone's shop, the Decorate tray) through `offerReplace`, rendered once in the game root.
 */
interface ReplaceOffer {
  readonly newPiece: DecorPieceDto;
  readonly olds: readonly DecorPieceDto[];
  readonly sellBacks: Readonly<Record<string, number>>;
}

interface ReplaceOfferState {
  readonly offer: ReplaceOffer | null;
  show(offer: ReplaceOffer): void;
  drop(pieceId: string): void;
  close(): void;
}

export const useReplaceOffer = create<ReplaceOfferState>()((set) => ({
  offer: null,
  show: (offer) => set({ offer }),
  drop: (pieceId) =>
    set((state) => {
      if (!state.offer) return state;
      const olds = state.offer.olds.filter((piece) => piece.id !== pieceId);
      return { offer: olds.length > 0 ? { ...state.offer, olds } : null };
    }),
  close: () => set({ offer: null }),
}));

/** Offer to replace what the new furniture outclasses (nothing if it outclasses nothing). */
export function offerReplace(furniture: FurniturePurchaseDto | undefined): void {
  const newPiece = furniture?.pieces[0];
  if (!furniture || !newPiece || furniture.replaces.length === 0) return;
  useReplaceOffer.getState().show({ newPiece, olds: furniture.replaces, sellBacks: furniture.sellBacks });
}

/** Where a piece stands, for people ("in the master suite"). */
export function whereIs(piece: DecorPieceDto): string {
  if (!piece.spot) return 'in storage';
  const rooms = (DECOR_HOME_ROOMS as Readonly<Record<string, Readonly<Record<string, { readonly label: string }>> | undefined>>)[piece.spot.templateId];
  const label = rooms?.[piece.spot.roomId]?.label;
  return label ? `in the ${label.toLowerCase()}` : 'in your home';
}

/** One line for a purchase of furniture: where the new piece went. */
export function arrivalMessage(furniture: FurniturePurchaseDto | undefined, name: string): string {
  const piece = furniture?.pieces[0];
  if (!piece) return `${name} is in your things now.`;
  return piece.spot ? `${name} is ${whereIs(piece)} — it's yours to move in Decorate mode.` : `${name} is in storage: there was no room for it in your home.`;
}

const percent = Math.round(FURNITURE_SELL_BACK_RATE * 100);

export function ReplaceFurnitureSheet() {
  const offer = useReplaceOffer((state) => state.offer);
  const { replace } = useDecorCommands();
  const first = offer?.olds[0];
  const firstItem = first ? findDecorItem(first.itemId) : undefined;
  const newItem = offer ? findDecorItem(offer.newPiece.itemId) : undefined;
  const close = (): void => useReplaceOffer.getState().close();

  const choose = (old: DecorPieceDto, mode: 'store' | 'sell'): void => {
    if (!offer) return;
    replace.mutate(
      { pieceId: offer.newPiece.id, oldId: old.id, mode },
      {
        onSuccess: (result) => {
          useReplaceOffer.getState().drop(old.id);
          announce(mode === 'sell' ? 'Sold back' : 'Stored', {
            body: mode === 'sell' ? `${findDecorItem(old.itemId)?.name ?? 'It'} fetched ${formatNaira(result.amount)}.` : `${findDecorItem(old.itemId)?.name ?? 'It'} is in storage.`,
            amount: mode === 'sell' ? result.amount : undefined,
            serverNotifies: false,
          });
        },
        onError: (error) => complain('Couldn’t do that', error),
      },
    );
  };

  return (
    <Sheet
      open={offer !== null && first !== undefined}
      onClose={close}
      title="Replace your old one?"
      description={newItem ? `Your new ${newItem.name} is ${offer ? whereIs(offer.newPiece) : ''}.` : undefined}
    >
      {offer && first && firstItem && (
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-sm">
            You still have the <strong>{firstItem.name}</strong> {whereIs(first)}. The new one can take its place.
          </p>
          <Button size="lg" block variant="paper" loading={replace.isPending} onClick={() => choose(first, 'store')}>
            <PackageOpen size={18} aria-hidden /> Store it
          </Button>
          <Button size="lg" block variant="paper" loading={replace.isPending} onClick={() => choose(first, 'sell')}>
            <Coins size={18} aria-hidden /> Sell it back · {formatNaira(offer.sellBacks[first.id] ?? 0)} ({percent}%)
          </Button>
          <Button size="lg" block variant="ink" onClick={close}>
            Keep both
          </Button>
        </div>
      )}
    </Sheet>
  );
}
