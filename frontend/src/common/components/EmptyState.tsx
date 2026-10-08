import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** An empty screen is an invitation to act: say what goes here and offer the next step. */
export function EmptyState({ icon: Icon, title, body, action }: { readonly icon: LucideIcon; readonly title: string; readonly body?: ReactNode; readonly action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-paper-2 text-text-soft">
        <Icon size={26} aria-hidden />
      </span>
      <p className="type-title mt-1 text-xl">{title}</p>
      {body && <p className="max-w-xs text-sm text-text-soft">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
