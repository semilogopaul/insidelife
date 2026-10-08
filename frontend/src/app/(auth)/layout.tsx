import type { ReactNode } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/common/components';

/** Split layout: a slogan panel (ink) and a bright form panel (paper). Stacks on phones. */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-paper text-text md:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink p-10 text-on-ink md:flex md:flex-col md:justify-between">
        <Link href="/" aria-label="Inside Life home">
          <Wordmark />
        </Link>
        <div>
          <p className="type-slogan text-[clamp(3.5rem,7vw,6.5rem)] uppercase text-danfo">
            No food
            <br />
            for lazy man
          </p>
          <p className="mt-6 max-w-sm text-on-ink-soft">Painted on a thousand danfos. Also the only rule of Inside Life: every naira you have, you earned.</p>
        </div>
        <span aria-hidden className="block h-[9px] w-40 danfo-stripes [--color-ink:var(--color-danfo)]" />
      </section>
      <section className="safe-pad flex flex-col justify-center px-6 py-10 sm:px-12">
        <Link href="/" aria-label="Inside Life home" className="mb-10 text-ink md:hidden">
          <Wordmark size="sm" />
        </Link>
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
