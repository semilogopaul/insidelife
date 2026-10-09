import type { Metadata } from 'next';
import Link from 'next/link';
import { site } from '@/config/site';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The rules for playing Inside Life.',
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of use</h1>
      <p className="text-sm text-text-soft">Last updated 9 October 2026</p>
      <p>
        Inside Life is an online life-simulation game set in Lagos, run from Nigeria. By creating an account
        you agree to these terms. If you don’t agree, please don’t use the game.
      </p>

      <h2>Who can play</h2>
      <ul>
        <li>
          You must be at least 13. If you’re under 18, a parent or guardian must agree to these terms and
          approve any purchase.
        </li>
        <li>
          One account per person. Keep your password to yourself; you’re responsible for what happens on your
          account.
        </li>
      </ul>

      <h2>Game money and purchases</h2>
      <ul>
        <li>
          In-game naira, items, houses and everything else in the game are part of a game. They have no value
          outside it and can’t be cashed out, sold for real money or transferred outside the game.
        </li>
        <li>
          You can buy in-game naira with real money (top-ups). Payments are processed by Paystack. What you
          get for each payment is shown before you pay. See the <Link href="/refunds">refund policy</Link>.
        </li>
        <li>Advertisers can buy billboard and app slots in the game. Every ad is reviewed before it runs.</li>
        <li>We may rebalance the game economy (prices, wages, rewards) to keep it fair and fun.</li>
      </ul>

      <h2>Playing fair and being decent</h2>
      <ul>
        <li>No cheating, bots, exploiting bugs, or tampering with the game or other players’ accounts.</li>
        <li>
          No harassment, hate, threats, scams, sexual content involving minors, or sharing other people’s
          private information.
        </li>
        <li>
          Chat, voice notes and photos must follow these rules. Photos are checked automatically for nudity
          before they’re sent.
        </li>
        <li>No trading accounts or game money for real money outside the game.</li>
      </ul>
      <p>
        We can remove content, mute, suspend or close accounts that break these rules. Serious cases may be
        reported to the authorities. You can block and report players in the game.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you write, record or upload. You give us permission to store it, show it to
        the people you send it to, and moderate it. Ads you upload are shown to players in the game while your
        campaign runs.
      </p>

      <h2>The service</h2>
      <p>
        We work hard to keep the game running, but it’s provided as it is. It may be down for maintenance,
        change, or occasionally lose recent progress. To the extent the law allows, we’re not liable for
        indirect losses, and our total liability to you is limited to what you paid us in the last 12 months.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We’ll post changes to these terms here and tell you in the game when they matter. Questions:{' '}
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>. These terms are governed by the laws
        of the Federal Republic of Nigeria.
      </p>
    </>
  );
}
