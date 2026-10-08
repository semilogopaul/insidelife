import Link from 'next/link';
import { Wordmark } from '@/common/components';
import { LagosNow, LifePath, LiveSkyline } from '@/modules/landing';

export default function LandingPage() {
  return (
    <main className="bg-ink text-on-ink">
      <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <LiveSkyline />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/35 to-transparent" />
        </div>

        <header className="safe-pad flex items-center justify-between px-5 sm:px-10">
          <Wordmark size="sm" />
          <Link href="/sign-in" className="rounded-card px-4 py-2 font-bold hover:bg-white/10">
            Sign in
          </Link>
        </header>

        <div className="mt-auto px-5 pb-10 sm:px-10 sm:pb-16">
          <h1 className="type-slogan max-w-4xl text-[clamp(3.6rem,13vw,10rem)] uppercase text-danfo">
            Live your whole
            <br />
            life in Lagos
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-on-ink">
            Write JAMB. Hustle. Drive across Third Mainland Bridge at sunset. Marry, build on land with a real C of O, and
            pass it on. Every naira you hold, you earned.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up" className="inline-flex h-14 items-center rounded-card bg-danfo px-7 text-lg font-bold text-ink shadow-[0_3px_0_var(--color-danfo-deep)] hover:bg-danfo-deep">
              Start your life
            </Link>
            <Link href="/sign-in" className="inline-flex h-14 items-center rounded-card px-6 text-lg font-bold ring-1 ring-white/30 hover:bg-white/10">
              Continue playing
            </Link>
          </div>
          <div className="mt-10 border-t border-white/15 pt-5">
            <LagosNow />
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-10">
        <h2 className="type-title max-w-2xl text-3xl sm:text-4xl">One life, start to finish</h2>
        <p className="mt-2 max-w-xl text-on-ink-soft">Time runs on Lagos time, sped up: a day passes in 12 minutes, a year in three days. The city keeps living when you log off.</p>
        <div className="mt-8">
          <LifePath />
        </div>
      </section>

      <footer className="flex flex-col gap-2 border-t border-white/10 px-5 py-8 text-sm text-on-ink-soft sm:flex-row sm:justify-between sm:px-10">
        <span>Inside Life — made for Lagos.</span>
        <span>Game money can’t be cashed out. Top-ups are processed securely by Paystack.</span>
      </footer>
    </main>
  );
}
