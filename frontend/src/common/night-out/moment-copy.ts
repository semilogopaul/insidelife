import type { VenueMomentDto } from '@insidelife/shared';

export type MomentCopySource = Pick<VenueMomentDto, 'kind' | 'tier' | 'from' | 'to' | 'label' | 'emoji' | 'message'>;

export interface MomentCopy {
  /** Small line above ("🎤 Shout out", "👑 Odogwu"). */
  readonly eyebrow: string;
  /** The name in bold. */
  readonly name: string;
  /** What happened, or the shoutout's message. */
  readonly text: string | null;
  /** One line for chips and screen readers ("@ada → @femi: Champagne 🍾"). */
  readonly line: string;
}

/** Banner wording for a moment. Pure. */
export function momentCopy(moment: MomentCopySource): MomentCopy {
  const from = `@${moment.from.handle}`;
  const to = moment.to ? `@${moment.to.handle}` : null;
  switch (moment.kind) {
    case 'shoutout': {
      const eyebrow = moment.tier === 'shoutout-odogwu' ? '👑 Odogwu in the building' : moment.tier === 'shoutout-big' ? '🎉 Big shout out' : '🎤 Shout out';
      return { eyebrow, name: from, text: moment.message, line: `${eyebrow}: ${from}${moment.message ? ` — ${moment.message}` : ''}` };
    }
    case 'bottle': {
      const line = `${from} → ${to ?? 'someone'}: ${moment.label} ${moment.emoji}`;
      return { eyebrow: moment.tier === 'bottle-parade' ? '🎆 Bottle parade' : `${moment.emoji} Bottle service`, name: `${from} → ${to ?? 'someone'}`, text: moment.label, line };
    }
    case 'birthday':
      return to
        ? { eyebrow: '🎂 Happy birthday', name: to, text: `From ${from} — everybody sing!`, line: `🎂 Happy birthday ${to}! From ${from}` }
        : { eyebrow: '🎂 Happy birthday', name: from, text: 'Everybody sing!', line: `🎂 Happy birthday ${from}!` };
    case 'champagne-shower':
      return { eyebrow: '🥂 Champagne shower', name: from, text: 'is showering the dance floor', line: `🥂 ${from} is showering the dance floor` };
    case 'confetti-cannon':
      return { eyebrow: '🎊 Confetti cannon', name: from, text: 'fired the cannons', line: `🎊 ${from} fired the confetti cannons` };
    case 'vip-section':
      return { eyebrow: '🛋️ VIP section', name: from, text: 'has the VIP section tonight', line: `🛋️ The VIP section is reserved for ${from} tonight` };
    case 'tip':
      return {
        eyebrow: moment.tier === 'tip-dj' ? '🎧 DJ tip' : '🍹 Bar tip',
        name: from,
        text: moment.tier === 'tip-dj' ? 'tipped the DJ' : 'tipped the bartender',
        line: `${moment.emoji} ${from} ${moment.tier === 'tip-dj' ? 'tipped the DJ' : 'tipped the bartender'}`,
      };
  }
}
