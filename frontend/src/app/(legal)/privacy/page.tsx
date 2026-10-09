import type { Metadata } from 'next';
import { site } from '@/config/site';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What Inside Life collects and why.',
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-sm text-text-soft">Last updated 9 October 2026</p>
      <p>
        This explains what Inside Life collects, why, and your rights under the Nigeria Data Protection Act
        2023. Questions or requests: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address and password (stored only as a one-way argon2 hash).
        </li>
        <li>
          <strong>Your game:</strong> your character, what you do in the game, your in-game money and
          purchases, and your friends and blocks.
        </li>
        <li>
          <strong>Chat:</strong> messages, voice notes and photos you send. They’re deleted automatically
          after 5 days. Photos are checked for nudity by software on our own servers; they aren’t sent to
          anyone else for that.
        </li>
        <li>
          <strong>Payments:</strong> Paystack handles your card or bank details. We only receive the payment
          reference, amount and result.
        </li>
        <li>
          <strong>Ads (advertisers):</strong> the images, text and links you upload, and how often your ad was
          shown.
        </li>
        <li>
          <strong>Technical:</strong> your IP address and basic logs to keep the service secure and working,
          and a login cookie.
        </li>
      </ul>
      <p>
        We don’t use your real location: positions in the game are positions in the game. The microphone is
        used only while you record a voice note.
      </p>

      <h2>Why</h2>
      <ul>
        <li>To run the game and your account (our contract with you).</li>
        <li>To keep players safe and stop fraud and abuse (our legitimate interest and legal duties).</li>
        <li>To process payments and keep the records the law requires.</li>
      </ul>
      <p>We don’t sell your personal data and we don’t use third-party advertising trackers.</p>

      <h2>What other players see</h2>
      <p>
        Your handle, character, status, and what you choose to share on your profile (you control parts of
        this in Me → Settings → Privacy). Messages are seen by the people you send them to.
      </p>

      <h2>Who else handles data</h2>
      <p>
        Paystack (payments) and our hosting provider. They process data only to provide their service to us.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Chat messages, voice notes and photos: 5 days.</li>
        <li>
          Your account and game: while your account exists. Payment records: as long as Nigerian law requires.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, ask us to correct it, or ask us to delete your account. You can
        object to some processing and complain to the Nigeria Data Protection Commission. Email{' '}
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> from your account’s email address and
        we’ll reply within 30 days.
      </p>

      <h2>Children</h2>
      <p>
        The game is for people aged 13 and over. If you believe a child under 13 has an account, tell us and
        we’ll remove it.
      </p>
    </>
  );
}
