import { Wallet } from 'lucide-react';
import { Money } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';

export function WalletChip({ balance }: { readonly balance: number }) {
  const openPhone = useUi((state) => state.openPhone);
  return (
    <button
      type="button"
      onClick={() => {
        gameEvents.emit('sfx', { id: 'ui-open' });
        openPhone('bank');
      }}
      className="glass flex h-12 items-center gap-2 rounded-card px-3.5 text-on-ink hover:brightness-110"
      aria-label="Open bank"
    >
      <Wallet size={18} aria-hidden className="text-danfo" />
      <Money amount={balance} compact className="type-figure text-lg" />
    </button>
  );
}
