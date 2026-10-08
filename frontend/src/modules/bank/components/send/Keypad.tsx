import { Delete } from 'lucide-react';
import type { KeypadKey } from '@/common/utils/money-input';

const KEYS: readonly KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'];

/** Phone-style number pad. Works with a mouse or touch; the amount field above also takes typed digits. */
export function Keypad({ onPress, label }: { readonly onPress: (key: KeypadKey) => void; readonly label: string }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-1.5">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onPress(key)}
          onContextMenu={(event) => {
            if (key !== 'back') return;
            event.preventDefault();
            onPress('clear');
          }}
          aria-label={key === 'back' ? 'Delete last digit' : key}
          className="type-figure grid h-11 place-items-center rounded-card bg-paper-2 text-xl text-ink transition-colors hover:bg-paper-3 active:bg-paper-3"
        >
          {key === 'back' ? <Delete size={22} aria-hidden /> : key}
        </button>
      ))}
    </div>
  );
}
