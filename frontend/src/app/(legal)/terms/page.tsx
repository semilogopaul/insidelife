import type { Metadata } from 'next';
import Link from 'next/link';
import { site } from '@/config/site';

export const metadata: Metadata = { title: 'Terms of use', description: 'The rules for playing Inside Life.' };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of use</h1>
      <p className="text-sm text-text-soft">Last updated 9 October 2026</p>
      <p>
        Inside Life is an online life-simulation game set in Lagos, operated from Nigeria by {site.operator} (“we”, “us”).
        By creating an account you agree to these terms. If you don’t agree, please don’t use the game.
      </p>

      <h2>Who can play</h2>
      <ul>
        <li>You must be at least 13. If you’re under 18, a parent or guardian must agree to these terms and approve any purchase.</li>
        <li>One account per person. Don’t share, sell, rent or trade accounts. You’re responsible for everything done on yours.</li>
      </ul>

      <h2>Game naira and in-game items</h2>
      <ul>
        <li>
          The naira in the game (“game naira”) is not money. It isn’t legal tender, isn’t issued or backed by the Central Bank
          of Nigeria, has no cash value, and can’t be withdrawn, redeemed or exchanged for real money or anything outside the
          game. The same goes for houses, cars, items, clout and everything else you earn or buy in the game.
        </li>
        <li>You get a licence to use them while you play; they belong to the game. Gifts, transfers and “spraying” between players move game naira only.</li>
        <li>
          We may rebalance the economy (prices, wages, rewards) and correct or remove game naira or items that came from bugs,
          exploits, fraud or reversed payments.
        </li>
      </ul>

      <h2>Buying things with real money</h2>
      <ul>
        <li>You can buy game naira (top-ups), ad space and club song plays. Payments are processed by Flutterwave; we never see your card details.</li>
        <li>The price and what you get are shown before you pay. Purchases are final once delivered.</li>
        <li>
          If a payment goes through but you don’t receive what you paid for, or you’re charged twice, email{' '}
          <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> with your payment reference.
        </li>
      </ul>

      <h2>Ads and songs</h2>
      <ul>
        <li>Every ad and song is reviewed before it runs. We can reject anything that breaks these terms or the law; rejected orders are refunded.</li>
        <li>Once an ad or song has started running, it can’t be cancelled or refunded.</li>
        <li>
          You must own or have permission to use everything you upload (images, logos, music). Songs can be at most 3 minutes long.
          You’re responsible for your ad’s claims and for the business behind it.
        </li>
      </ul>

      <h2>Playing fair and being decent</h2>
      <ul>
        <li>No cheating, bots, exploiting bugs, multiple accounts to farm rewards, or tampering with the game or other players’ accounts.</li>
        <li>No harassment, hate, threats, scams, sexual content involving minors, or sharing other people’s private information.</li>
        <li>Chat, voice notes and photos must follow these rules. Photos are checked automatically before they’re sent.</li>
        <li>No buying or selling game naira, items or accounts for real money outside the game.</li>
      </ul>
      <p>
        We can remove content, mute, suspend or close accounts that break these rules, and reverse what was gained by
        breaking them. Serious cases may be reported to the authorities. You can block and report players in the game.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you write, record or upload. You give us a worldwide, non-exclusive licence to store it,
        show it to the people it’s meant for, and moderate it while it’s in the game.
      </p>

      <h2>Deleting your account</h2>
      <p>
        You can delete your account in the game (Me → Settings). It stops working straight away and disappears from other
        players. We keep the records we need for payments, fraud prevention and the law (see the{' '}
        <Link href="/privacy">privacy policy</Link>). Changed your mind? Email us within 30 days and we can restore it.
      </p>

      <h2>The service</h2>
      <p>
        We work hard to keep the game running, but it’s provided as it is. It may be down for maintenance, change, or
        occasionally lose recent progress. The game is fiction (see the <Link href="/disclaimer">disclaimer</Link>). To the
        extent the law allows, we’re not liable for indirect losses, and our total liability to you is limited to what you
        paid us in the 12 months before the claim. Nothing here limits your rights under Nigerian consumer protection law.
      </p>

      <h2>Changes, disputes and contact</h2>
      <p>
        We’ll post changes to these terms here and tell you in the game when they matter. If something goes wrong, contact
        us first and we’ll try to sort it out. These terms are governed by the laws of the Federal Republic of Nigeria.
        Questions: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>
    </>
  );
}
