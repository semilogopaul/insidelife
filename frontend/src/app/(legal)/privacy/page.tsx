import type { Metadata } from 'next';
import { site } from '@/config/site';

export const metadata: Metadata = { title: 'Privacy policy', description: 'What Inside Life collects and why.' };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-sm text-text-soft">Last updated 9 October 2026</p>
      <p>
        This explains what Inside Life collects, why, and your rights under the Nigeria Data Protection Act 2023. Inside
        Life is operated by {site.operator}, the data controller. Questions or requests:{' '}
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address, your password (stored only as a one-way argon2 hash) and your date
          of birth (to check you’re 13 or older; never shown to other players). If you confirm your email, we send a
          one-time code to it.
        </li>
        <li>
          <strong>Your game:</strong> your character, what you do in the game, your in-game money and purchases, and your
          friends and blocks.
        </li>
        <li>
          <strong>Chat:</strong> messages, voice notes and photos you send. They’re deleted automatically after 5 days.
          Photos are checked for nudity by software on our own servers; they aren’t sent to anyone else for that.
        </li>
        <li>
          <strong>Payments:</strong> Flutterwave handles your card, bank or transfer details. We only receive the payment
          reference, amount, status and the email used.
        </li>
        <li>
          <strong>Ads and songs:</strong> the images, text, links and audio you upload, and how often your ad was shown.
        </li>
        <li>
          <strong>Technical:</strong> your IP address, browser and device type, and basic logs, to keep the service secure,
          stop abuse and fix problems.
        </li>
      </ul>
      <p>
        We don’t use your real location: places in the game are fictional positions in a fictional city. The microphone is
        used only while you record a voice note.
      </p>

      <h2>Why (and on what basis)</h2>
      <ul>
        <li>To run the game and your account — our contract with you.</li>
        <li>To keep players safe, stop cheating, fraud and abuse, and improve the game — our legitimate interests.</li>
        <li>To process payments and keep the records the law requires — legal obligation.</li>
        <li>Optional things, such as confirming your email — your consent, which you can withdraw.</li>
      </ul>
      <p>We don’t sell your personal data and we don’t use third-party advertising or analytics trackers.</p>

      <h2>Cookies and storage on your device</h2>
      <ul>
        <li>
          <strong>One essential cookie</strong> keeps you signed in (a secure, http-only session cookie). The game can’t work
          without it, so it doesn’t need consent.
        </li>
        <li>
          <strong>Your browser’s local storage</strong> remembers settings such as sound and graphics, and the installable
          app keeps a copy of game files so it loads fast. Nothing there is used to track you.
        </li>
        <li>No advertising, analytics or social-media cookies. If we ever add any, we’ll ask first.</li>
      </ul>

      <h2>What other players see</h2>
      <p>
        Your handle, character, status, and what you choose to share on your profile (you control parts of this in Me →
        Settings → Privacy). Messages are seen by the people you send them to.
      </p>

      <h2>Who else handles data</h2>
      <p>
        Flutterwave (payments), our hosting and storage providers, and our email provider (sign-in codes). They process data
        only to provide their service to us, and some may do so outside Nigeria with safeguards required by Nigerian data
        protection law.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Chat messages, voice notes and photos: 5 days.</li>
        <li>Your account and game: while your account exists.</li>
        <li>
          When you delete your account, it’s closed straight away and hidden from other players. We keep it for 30 days so it
          can be restored, then remove or anonymise what we don’t need. Payment and in-game money records, and records needed
          to prevent fraud or settle disputes, are kept for as long as the law requires.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, ask us to correct it, ask us to delete your account (or do it yourself in Me →
        Settings), object to or restrict some processing, take your data elsewhere, and complain to the Nigeria Data
        Protection Commission. Email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> from your account’s
        email address and we’ll reply within 30 days.
      </p>

      <h2>Security</h2>
      <p>
        We protect your data with encryption in transit, hashed passwords, access controls and monitoring. No system is
        perfectly secure; if a breach affects you, we’ll tell you and the regulator as the law requires.
      </p>

      <h2>Children</h2>
      <p>
        The game is for people aged 13 and over. If you believe a child under 13 has an account, tell us and we’ll remove it.
      </p>
    </>
  );
}
