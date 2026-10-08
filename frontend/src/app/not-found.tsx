import Link from 'next/link';
import { Wordmark } from '@/common/components';

export default function NotFound() {
  return (
    <main className="safe-pad grid min-h-dvh place-items-center bg-ink text-on-ink">
      <div className="max-w-sm text-center">
        <Wordmark className="mx-auto mb-8" />
        <h1 className="type-title text-3xl">Wrong bus stop</h1>
        <p className="mt-2 text-on-ink-soft">This page doesn’t exist. Even the agbero doesn’t know where it is.</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-card bg-danfo px-5 font-bold text-ink">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
