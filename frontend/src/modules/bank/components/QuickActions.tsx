import { CreditCard, PiggyBank, ReceiptText, Send, type LucideIcon } from 'lucide-react';
import { gameEvents } from '@/common/game/game-events';
import { cn } from '@/common/utils/cn';
import type { BankScreen } from '../types/bank';

const ACTIONS: ReadonlyArray<{ readonly id: Exclude<BankScreen, 'home'>; readonly label: string; readonly icon: LucideIcon }> = [
  { id: 'send', label: 'Send', icon: Send },
  { id: 'topup', label: 'Top up', icon: CreditCard },
  { id: 'savings', label: 'Save', icon: PiggyBank },
  { id: 'statement', label: 'Statement', icon: ReceiptText },
];

/** The four things people open a bank app for. Send is the loud one. */
export function QuickActions({ onOpen }: { readonly onOpen: (screen: Exclude<BankScreen, 'home'>) => void }) {
  return (
    <nav aria-label="Bank actions">
      <ul className="grid grid-cols-4 gap-2">
        {ACTIONS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => {
                gameEvents.emit('sfx', { id: 'ui-click' });
                onOpen(id);
              }}
              className="group flex w-full flex-col items-center gap-1.5 rounded-card py-1"
            >
              <span
                className={cn(
                  'grid size-13 place-items-center rounded-full transition-transform group-active:scale-95',
                  id === 'send' ? 'bg-danfo text-ink shadow-[0_3px_0_var(--color-danfo-deep)]' : 'bg-paper-2 text-ink group-hover:bg-paper-3',
                )}
              >
                <Icon size={22} aria-hidden strokeWidth={2.2} />
              </span>
              <span className="text-xs font-bold">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
