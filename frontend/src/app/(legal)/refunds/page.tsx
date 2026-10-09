import type { Metadata } from 'next';
import { site } from '@/config/site';

export const metadata: Metadata = {
  title: 'Refund policy',
  description: 'Refunds for top-ups and ads in Inside Life.',
};

export default function RefundsPage() {
  return (
    <>
      <h1>Refund policy</h1>
      <p className="text-sm text-text-soft">Last updated 9 October 2026</p>

      <h2>Top-ups (in-game naira)</h2>
      <p>
        In-game naira is delivered to your wallet as soon as Paystack confirms the payment, so top-ups are
        final once credited. We refund in full when:
      </p>
      <ul>
        <li>you were charged but the naira never arrived;</li>
        <li>you were charged twice for the same top-up;</li>
        <li>the payment wasn’t made by you or with your permission (tell us quickly).</li>
      </ul>
      <p>There’s a daily spending limit on top-ups to protect players.</p>

      <h2>Ads (billboards and sponsored apps)</h2>
      <ul>
        <li>Every ad is reviewed before it runs. If we reject it, you get a full refund.</li>
        <li>Once an ad has started running, the days already shown aren’t refundable.</li>
        <li>
          If the game is down for a large part of your campaign, we’ll extend it or refund the affected days.
        </li>
      </ul>

      <h2>How to ask</h2>
      <p>
        Email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> within 14 days of the payment
        with your account email and the Paystack reference (it’s in your bank app or receipt). Approved
        refunds go back to the original payment method through Paystack, usually within 5-10 working days.
      </p>
    </>
  );
}
