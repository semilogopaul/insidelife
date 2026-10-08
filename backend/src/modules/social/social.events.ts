import { MINUTES_PER_DAY, dayIndexOf, formatNaira } from '@insidelife/shared';
import type { LifeEventDefinition, LifeEventOutcome, LifeEventParams } from '../events/interfaces/life-event.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { addMood, adjustConnections, adjustStatus, boostNeeds } from './social-effects.js';

/** Used when the player has no real friends yet (or for flavour). */
const NPC_FRIENDS: readonly string[] = [
  'Chidi from secondary school',
  'Tolu, Aunty Bisi’s daughter',
  'Emeka, your NYSC batchmate',
  'Ade from the estate',
  'Zainab from your old fellowship',
];

const OCCASIONS: readonly string[] = ['wedding', '50th birthday', 'house-warming', 'naming ceremony', 'chieftaincy title'];
const GROUP_CHATS: readonly string[] = ['Class of 2026', 'Family WhatsApp group', 'Estate residents forum', 'Church youth fellowship'];
const GROUP_TOPICS: readonly string[] = [
  'Wizkid vs Davido (again)',
  'whether Jollof should have bay leaves',
  'who finished the estate diesel contribution',
  'a “broadcast” about free MTN data',
];
const OLD_TWEETS: readonly string[] = [
  '“Amala is overrated”',
  '“I will never enter danfo again in my life”',
  '“Lagos men are all the same”',
  '“Abuja is better than Lagos”',
];
const CATFISH_PERSONAS: readonly string[] = [
  '“Jennifer from Texas”',
  'a “US Army general” deployed in Syria',
  '“Sandra”, a Lekki big girl with no face on her profile',
  'an “agent of the Dangote Foundation”',
];

const text = (params: LifeEventParams, key: string): string => String(params[key] ?? '');
const amount = (params: LifeEventParams, key: string): number => Number(params[key] ?? 0);
const affordable = (key: string) => (ctx: SimulationContext, params: LifeEventParams): string | null =>
  ctx.wallet.canAfford(amount(params, key)) ? null : 'You no get that kind money right now';

/** A real friend's @handle when you have friends (deterministic per day), otherwise a familiar NPC. */
async function pickFriend(ctx: SimulationContext, purpose: string): Promise<string> {
  const rows: Array<{ handle: string }> = await ctx.manager.query(
    `SELECT c.handle
       FROM social_friendships f
       JOIN characters c ON c.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
      WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1) AND c.alive
   ORDER BY c.handle
      LIMIT 50`,
    [ctx.character.id],
  );
  const rng = ctx.rng('social-event-friend', purpose, dayIndexOf(ctx.time));
  return rows.length > 0 ? `@${rng.pick(rows).handle}` : rng.pick(NPC_FRIENDS);
}

const friendBirthday: LifeEventDefinition = {
  id: 'social-friend-birthday',
  domain: 'social',
  art: '🎂',
  weight: 3,
  cooldownDays: 10,
  eligible: () => true,
  prepare: async (ctx) => ({ friend: await pickFriend(ctx, 'birthday'), cake: ctx.world.price(15_000, ctx.time), ref: ctx.time }),
  title: (p) => `It’s ${text(p, 'friend')}’s birthday!`,
  body: (p) => `Your WhatsApp status is full of ${text(p, 'friend')}’s pictures. Everybody is posting “HBD, more life, more blessings”. Will you show love?`,
  choices: [
    {
      id: 'shout-out',
      label: () => 'Post a shout-out',
      hint: () => 'free',
      resolve: async (ctx, p): Promise<LifeEventOutcome> => {
        boostNeeds(ctx, { social: 10 });
        adjustStatus(ctx, 1);
        return { title: 'Love don show', body: `${text(p, 'friend')} replied “Thank you dear ❤️” — 40 likes and counting.`, tone: 'good' };
      },
    },
    {
      id: 'send-cake',
      label: (p) => `Send a cake (${formatNaira(amount(p, 'cake'))})`,
      hint: () => 'they will remember this',
      unavailable: affordable('cake'),
      resolve: async (ctx, p): Promise<LifeEventOutcome> => {
        const cost = amount(p, 'cake');
        await ctx.wallet.pay(cost, 'gift', `Birthday cake for ${text(p, 'friend')}`, `birthday-cake:${amount(p, 'ref')}`);
        boostNeeds(ctx, { social: 18 });
        adjustConnections(ctx, 1);
        adjustStatus(ctx, 2);
        return { title: 'Cake delivered', body: `${text(p, 'friend')} posted the cake with “See who loves me 😭”.`, tone: 'good', moneyDelta: -cost };
      },
    },
    {
      id: 'forget',
      label: () => 'Scroll past',
      resolve: async (ctx, p): Promise<LifeEventOutcome> => {
        boostNeeds(ctx, { social: -5 });
        return { title: 'They noticed', body: `${text(p, 'friend')} viewed your status but you didn’t wish them. Cold.`, tone: 'bad' };
      },
    },
  ],
  defaultChoiceId: 'forget',
};

const viralPost: LifeEventDefinition = {
  id: 'social-viral-post',
  domain: 'social',
  art: '📈',
  weight: 2,
  cooldownDays: 20,
  eligible: () => true,
  prepare: (ctx) => {
    const rng = ctx.rng('social-viral', dayIndexOf(ctx.time));
    return {
      likes: rng.int(12, 180),
      deal: ctx.world.price(Math.min(1_000_000, 50_000 + ctx.character.status * 800), ctx.time),
      ref: ctx.time,
    };
  },
  title: () => 'Your post went viral!',
  body: (p) => `Your rant about Third Mainland Bridge traffic has ${amount(p, 'likes')}k likes. Brands are sliding into your DMs.`,
  choices: [
    {
      id: 'milk-it',
      label: () => 'Milk it: take a brand deal',
      hint: (p) => `up to ${formatNaira(amount(p, 'deal'))} if you have the clout`,
      resolve: async (ctx, p): Promise<LifeEventOutcome> => {
        adjustStatus(ctx, 12);
        if (ctx.character.status < 100) {
          return { title: 'Clout, no cash', body: 'The brands said your following is “still growing”. At least Lagos knows your name now.', tone: 'neutral' };
        }
        const deal = amount(p, 'deal');
        // Influencer income is earned: it counts toward the self-made rich list.
        await ctx.wallet.receive(deal, 'event-reward', 'Brand deal from a viral post', `viral-deal:${amount(p, 'ref')}`, { income: 'earned' });
        return { title: 'Influencer era', body: `A juice brand paid ${formatNaira(deal)} for one post. #Ad`, tone: 'good', moneyDelta: deal };
      },
    },
    {
      id: 'log-off',
      label: () => 'Let it ride and log off',
      resolve: async (ctx): Promise<LifeEventOutcome> => {
        adjustStatus(ctx, 6);
        boostNeeds(ctx, { fun: 5 });
        return { title: 'Mysterious', body: 'You didn’t reply anybody. Somehow that made you even more famous.', tone: 'good' };
      },
    },
  ],
  defaultChoiceId: 'log-off',
};

const groupChatDrama: LifeEventDefinition = {
  id: 'social-group-chat-drama',
  domain: 'social',
  art: '💬',
  weight: 3,
  cooldownDays: 7,
  eligible: () => true,
  prepare: (ctx) => {
    const rng = ctx.rng('social-gc', dayIndexOf(ctx.time));
    return { group: rng.pick(GROUP_CHATS), topic: rng.pick(GROUP_TOPICS), roll: rng.next() };
  },
  title: (p) => `Wahala in the ${text(p, 'group')} chat`,
  body: (p) => `400 unread messages about ${text(p, 'topic')}. Someone just tagged you.`,
  choices: [
    {
      id: 'jump-in',
      label: () => 'Jump in with your hottest take',
      hint: () => 'risky',
      resolve: async (ctx, p): Promise<LifeEventOutcome> => {
        boostNeeds(ctx, { fun: 10 });
        if (amount(p, 'roll') < 0.5) {
          adjustStatus(ctx, 4);
          return { title: 'You ended the argument', body: 'Your comeback is now the pinned message. Legend.', tone: 'good' };
        }
        adjustConnections(ctx, -1);
        boostNeeds(ctx, { social: -5 });
        return { title: 'Removed by admin', body: 'You dragged the admin’s cousin. “You have been removed.”', tone: 'bad' };
      },
    },
    {
      id: 'mute',
      label: () => 'Mute for 8 hours',
      resolve: async (ctx): Promise<LifeEventOutcome> => {
        boostNeeds(ctx, { fun: -2 });
        return { title: 'Peace (for now)', body: 'You’ll read it all at 2am anyway.', tone: 'neutral' };
      },
    },
    {
      id: 'exit',
      label: () => 'Exit the group quietly',
      resolve: async (ctx): Promise<LifeEventOutcome> => {
        adjustConnections(ctx, -1);
        addMood(ctx, 'left-group-chat', 'Peace of mind', 3, MINUTES_PER_DAY);
        return { title: '“You left”', body: 'Three people DM’d to ask if you’re okay. You are thriving.', tone: 'neutral' };
      },
    },
  ],
  defaultChoiceId: 'mute',
};

const owambeInvite: LifeEventDefinition = {
  id: 'social-owambe-invite',
  domain: 'social',
  art: '🎊',
  weight: 3,
  cooldownDays: 12,
  eligible: () => true,
  prepare: async (ctx) => {
    const rng = ctx.rng('social-owambe-invite', dayIndexOf(ctx.time));
    return {
      friend: await pickFriend(ctx, 'owambe'),
      occasion: rng.pick(OCCASIONS),
      asoEbi: ctx.world.price(rng.int(25, 90) * 1_000, ctx.time),
      ref: ctx.time,
    };
  },
  title: (p) => `Owambe invite: ${text(p, 'friend')}’s ${text(p, 'occasion')}`,
  body: (p) => `${text(p, 'friend')} sent the IV and the aso-ebi price in the same message: ${formatNaira(amount(p, 'asoEbi'))}. “Colour is wine and gold.”`,
  choices: [
    {
      id: 'buy-aso-ebi',
      label: (p) => `Buy the aso-ebi and go (${formatNaira(amount(p, 'asoEbi'))})`,
      unavailable: affordable('asoEbi'),
      resolve: async (ctx, p): Promise<LifeEventOutcome> => {
        const cost = amount(p, 'asoEbi');
        await ctx.wallet.pay(cost, 'ceremony', `Aso-ebi for ${text(p, 'friend')}’s ${text(p, 'occasion')}`, `aso-ebi:${amount(p, 'ref')}`);
        boostNeeds(ctx, { social: 20, fun: 15 });
        adjustConnections(ctx, 1.5);
        adjustStatus(ctx, 3);
        addMood(ctx, 'owambe-invite', 'Owambe vibes', 6, MINUTES_PER_DAY);
        return { title: 'You matched the family', body: 'Party jollof, small chops and your picture in the official album.', tone: 'good', moneyDelta: -cost };
      },
    },
    {
      id: 'go-casual',
      label: () => 'Go without aso-ebi',
      hint: () => 'free, but…',
      resolve: async (ctx): Promise<LifeEventOutcome> => {
        boostNeeds(ctx, { social: 12, fun: 8 });
        adjustStatus(ctx, -2);
        return { title: 'Odd one out', body: 'Everyone was in wine and gold. You were in a black T-shirt. The photographer skipped you.', tone: 'neutral' };
      },
    },
    {
      id: 'decline',
      label: () => 'Send “I’ll be there in spirit”',
      resolve: async (ctx, p): Promise<LifeEventOutcome> => {
        adjustConnections(ctx, -0.5);
        return { title: 'In spirit', body: `${text(p, 'friend')} saw the message. They will remember at your own party.`, tone: 'neutral' };
      },
    },
  ],
  defaultChoiceId: 'decline',
};

const screenshotTweet: LifeEventDefinition = {
  id: 'social-old-tweet',
  domain: 'social',
  art: '📸',
  weight: 2,
  cooldownDays: 25,
  eligible: (ctx) => ctx.age >= 18,
  prepare: (ctx) => {
    const rng = ctx.rng('social-old-tweet', dayIndexOf(ctx.time));
    return { tweet: rng.pick(OLD_TWEETS), roll: rng.next() };
  },
  title: () => 'Someone screenshot your old tweet',
  body: (p) => `Your 2019 tweet ${text(p, 'tweet')} is trending with 12k quote tweets. The timeline wants answers.`,
  choices: [
    {
      id: 'apologise',
      label: () => 'Post a Notes-app apology',
      resolve: async (ctx): Promise<LifeEventOutcome> => {
        adjustStatus(ctx, -3);
        return { title: 'Apology accepted (mostly)', body: 'Half the timeline forgave you. The other half is still quoting.', tone: 'neutral' };
      },
    },
    {
      id: 'double-down',
      label: () => 'Double down',
      hint: () => 'very risky',
      resolve: async (ctx, p): Promise<LifeEventOutcome> => {
        if (amount(p, 'roll') < 0.4) {
          adjustStatus(ctx, 10);
          boostNeeds(ctx, { fun: 10 });
          return { title: 'Lagos agreed with you', body: 'Your thread of receipts went viral. You are now “the voice of the people”.', tone: 'good' };
        }
        adjustStatus(ctx, -12);
        boostNeeds(ctx, { social: -10 });
        return { title: 'You got dragged', body: 'Even your mum quote-tweeted you. Log off for a while.', tone: 'bad' };
      },
    },
    {
      id: 'go-private',
      label: () => 'Lock your account and hide',
      resolve: async (ctx): Promise<LifeEventOutcome> => {
        adjustStatus(ctx, -5);
        boostNeeds(ctx, { fun: -5 });
        return { title: 'Gone private', body: '“Why is your account locked?” — everyone, in your DMs.', tone: 'bad' };
      },
    },
  ],
  defaultChoiceId: 'go-private',
};

const catfishDm: LifeEventDefinition = {
  id: 'social-catfish-dm',
  domain: 'social',
  art: '🎣',
  weight: 2,
  cooldownDays: 20,
  eligible: () => true,
  prepare: (ctx) => {
    const rng = ctx.rng('social-catfish', dayIndexOf(ctx.time));
    return { persona: rng.pick(CATFISH_PERSONAS), ask: ctx.world.price(rng.int(5, 15) * 10_000, ctx.time), ref: ctx.time };
  },
  title: () => 'A sweet DM from a stranger',
  body: (p) =>
    `${text(p, 'persona')} slid into your DMs. After two days of “good morning dear”, they need ${formatNaira(amount(p, 'ask'))} for a “flight ticket” to come and see you.`,
  choices: [
    {
      id: 'block',
      label: () => 'Block and laugh',
      resolve: async (ctx): Promise<LifeEventOutcome> => {
        boostNeeds(ctx, { fun: 3 });
        return { title: 'Scam radar: elite', body: 'Yahoo boys, not today. Your money stays in your account.', tone: 'good' };
      },
    },
    {
      id: 'send-money',
      label: (p) => `Send ${formatNaira(amount(p, 'ask'))}`,
      unavailable: affordable('ask'),
      resolve: async (ctx, p): Promise<LifeEventOutcome> => {
        const cost = amount(p, 'ask');
        await ctx.wallet.pay(cost, 'gift', `“Flight ticket” for ${text(p, 'persona')}`, `catfish:${amount(p, 'ref')}`);
        addMood(ctx, 'catfished', 'Catfished', -8, MINUTES_PER_DAY);
        return { title: 'Blocked immediately', body: 'The account disappeared ten seconds after the alert. Na wa.', tone: 'bad', moneyDelta: -cost };
      },
    },
    {
      id: 'report',
      label: () => 'Expose them on the timeline',
      resolve: async (ctx): Promise<LifeEventOutcome> => {
        adjustStatus(ctx, 1);
        adjustConnections(ctx, 0.5);
        return { title: 'Public service', body: 'Your thread saved three people from the same “Jennifer”.', tone: 'good' };
      },
    },
  ],
  defaultChoiceId: 'block',
};

/** Social life-event cards, registered by `SocialModule`. */
export const SOCIAL_LIFE_EVENTS: readonly LifeEventDefinition[] = [friendBirthday, viralPost, groupChatDrama, owambeInvite, screenshotTweet, catfishDm];
