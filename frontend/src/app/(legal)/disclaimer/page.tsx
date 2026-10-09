import type { Metadata } from 'next';
import { site } from '@/config/site';

export const metadata: Metadata = { title: 'Disclaimer', description: 'Inside Life is a game: what it is and isn’t.' };

export default function DisclaimerPage() {
  return (
    <>
      <h1>Disclaimer</h1>
      <p className="text-sm text-text-soft">Last updated 9 October 2026</p>
      <p>
        Inside Life is a game made for entertainment by {site.operator}. It is inspired by real life in Lagos, but it is
        fiction.
      </p>

      <h2>Fiction, not a record of real life</h2>
      <p>
        Events, characters, prices, wages, outcomes and conversations in the game are invented, simplified, exaggerated or
        randomised to make it fun. Nothing in the game describes a real person, and any resemblance is coincidence.
      </p>

      <h2>Real places, schools and brands</h2>
      <p>
        The game mentions real places, streets, schools, hospitals, clubs, car makers and other brands to make Lagos feel
        real. That doesn’t mean they endorse, sponsor or are connected with the game, and what happens to them in the game
        isn’t a statement about them. Paid ads in the game are labelled and are the advertiser’s responsibility.
      </p>

      <h2>Government and institutions</h2>
      <p>
        Inside Life is not run by or connected with any government. Ministries, agencies, exams, courts, the police, banks
        and other institutions in the game are simulations, not their real procedures.
      </p>

      <h2>Not advice</h2>
      <p>
        Jobs, businesses, property, investments, health, law and relationships in the game are game mechanics. They are not
        financial, investment, medical, legal or career advice, and they’re not real offers.
      </p>

      <h2>Game naira</h2>
      <p>
        Game naira is not Nigerian legal tender, isn’t issued or guaranteed by the Central Bank of Nigeria, and can’t be
        cashed out. Gifts, transfers, nightlife spending and “spraying” in the game use game naira only. The game shows
        drinking and nightlife for adult characters; it doesn’t encourage either in real life.
      </p>

      <p>
        Questions: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>
    </>
  );
}
