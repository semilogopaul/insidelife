import Link from 'next/link';
import { cn } from '@/common/utils/cn';

export interface AuthSwitchProps {
  readonly mode: 'sign-in' | 'sign-up';
}

const TABS = [
  { mode: 'sign-in', href: '/sign-in', label: 'Sign in' },
  { mode: 'sign-up', href: '/sign-up', label: 'Create account' },
] as const;

/** Sign in ↔ create account, always one tap away at the top of both forms. */
export function AuthSwitch({ mode }: AuthSwitchProps) {
  return (
    <nav
      aria-label="Account"
      className="mb-8 grid grid-cols-2 gap-1 rounded-card bg-paper-2 p-1 ring-1 ring-line"
    >
      {TABS.map((tab) => {
        const current = tab.mode === mode;
        return (
          <Link
            key={tab.mode}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'grid h-10 place-items-center rounded-[calc(var(--radius-card)-4px)] text-sm font-bold transition',
              current ? 'bg-ink text-on-ink' : 'text-text-soft hover:bg-paper hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
