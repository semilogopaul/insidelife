import Link from 'next/link';
import type { ReactNode } from 'react';
import { site } from '@/config/site';

/** Terms, privacy and the disclaimer: plain, readable pages (no game chrome). */
export default function LegalLayout({ children }: { readonly children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-paper text-text">
      <header className="border-b border-line px-5 py-4 sm:px-10">
        <Link href="/" className="type-title text-lg text-ink">
          Inside Life
        </Link>
      </header>
      <article className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-8 leading-relaxed sm:px-6 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-black [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_a]:font-bold [&_a]:underline">
        {children}
      </article>
      <footer className="border-t border-line px-5 py-6 text-sm text-text-soft sm:px-10">
        <nav aria-label="Legal" className="flex flex-wrap gap-4">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/disclaimer">Disclaimer</Link>
          <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
        </nav>
        <p className="mt-2">© {new Date().getFullYear()} {site.operator}</p>
      </footer>
    </main>
  );
}
