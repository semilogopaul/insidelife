import Link from 'next/link';
import type { ReactNode } from 'react';
import { Spinner, Wordmark } from '@/common/components';
import { useSession } from '@/common/auth/session-store';

/** Full-page frame for the checkout hops (outside /play): ink street, one paper card in the middle. */
export function CheckoutShell({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <main className="safe-pad relative flex min-h-dvh flex-col items-center bg-ink px-4 text-on-ink">
      <header className="flex w-full max-w-md items-center justify-between py-4">
        <Link href="/play" aria-label="Back to Inside Life" className="text-white">
          <Wordmark size="sm" />
        </Link>
        <span className="text-xs font-bold text-on-ink-soft">{label}</span>
      </header>
      <div className="flex w-full max-w-md flex-1 flex-col justify-center pb-10">
        <div className="relative overflow-hidden rounded-sheet bg-paper p-6 text-text shadow-[0_24px_60px_rgb(4_18_24/0.5)]">{children}</div>
      </div>
    </main>
  );
}

/**
 * Waits for the session to be restored from the refresh cookie (these pages are usually opened by a full-page
 * redirect), then renders the children; anonymous visitors get a sign-in link that brings them back here.
 */
export function SessionGate({ children, returnTo }: { readonly children: ReactNode; readonly returnTo: string }) {
  const status = useSession((state) => state.status);
  if (status === 'unknown') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-text-soft" role="status">
        <Spinner size={26} />
        <p className="text-sm">Signing you back in…</p>
      </div>
    );
  }
  if (status === 'anonymous') {
    return (
      <div className="py-4 text-center">
        <p className="type-title text-2xl">Sign in to finish</p>
        <p className="mt-2 text-sm text-text-soft">Your session ended while you were paying. Sign in and we’ll pick up where you left off — nothing is charged twice.</p>
        <Link
          href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
          className="mt-5 inline-flex h-12 items-center justify-center rounded-card bg-danfo px-5 font-bold text-ink shadow-[0_3px_0_var(--color-danfo-deep)]"
        >
          Sign in
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
