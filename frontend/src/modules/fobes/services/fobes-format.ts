import { FOBES_LIST_LIMIT, formatDate, type FobesEntryDto, type FobesMoveDto, type FobesPositionDto, type FobesWealthMixDto } from '@insidelife/shared';

/** "#1", "#2,341". */
export function rankLabel(rank: number): string {
  return `#${rank.toLocaleString('en-NG')}`;
}

export function fullName(entry: Pick<FobesEntryDto, 'firstName' | 'lastName'>): string {
  return `${entry.firstName} ${entry.lastName}`.trim();
}

export function initials(entry: Pick<FobesEntryDto, 'firstName' | 'lastName'>): string {
  return `${entry.firstName.charAt(0)}${entry.lastName.charAt(0)}`.toUpperCase();
}

/** Under the name: their job title (or clout tier) and age. */
export function byline(entry: Pick<FobesEntryDto, 'title' | 'statusTier' | 'age'>): string {
  return `${entry.title ?? entry.statusTier.label} · ${entry.age}`;
}

/** The pinned "you" line: your rank (even far beyond the list) and who to beat next. */
export function positionLines(position: FobesPositionDto): { readonly headline: string; readonly detail: string } {
  if (position.rank === null) {
    return {
      headline: 'Not on this list yet',
      detail: position.list === 'self-made' ? 'Earn your first naira that isn’t a gift and you’re on it.' : 'Build something and you’re on it.',
    };
  }
  const headline = `You’re ${rankLabel(position.rank)}`;
  if (!position.next) return { headline, detail: position.rank === 1 ? 'Top of Lagos. Everybody is chasing you.' : 'Keep going.' };
  const { gap, rank } = position.next;
  return { headline, detail: position.inTop ? `${gap.display} to pass ${rankLabel(rank)}` : `${gap.display} to the top ${FOBES_LIST_LIMIT}` };
}

/** Words for a move a screen reader can say ("up 34%"), alongside the arrow drawn for sighted players. */
export function moveSpoken(move: FobesMoveDto): string {
  if (move.newEntry) return 'New entry';
  const rising = (move.change ?? move.pct ?? 0) >= 0;
  return `${rising ? 'Up' : 'Down'} ${move.display.replace(/^[+-]/, '')}`;
}

export function isRise(move: FobesMoveDto): boolean {
  return move.newEntry || (move.change ?? move.pct ?? 0) >= 0;
}

/** "was #12" / "new to the top 100". */
export function moveContext(move: FobesMoveDto): string {
  if (move.newEntry) return `New to the top ${FOBES_LIST_LIMIT}`;
  return move.rankBefore === null ? 'Was outside the list' : `Was ${rankLabel(move.rankBefore)}`;
}

export function sinceLabel(since: number | null): string | null {
  return since === null ? null : `Since ${formatDate(since)}`;
}

/** "82% self-made · 18% given": what the mix bar shows in words. */
export function mixSummary(mix: FobesWealthMixDto): string {
  const parts = [
    mix.selfMadePct > 0 ? `${mix.selfMadePct}% self-made` : null,
    mix.givenPct > 0 ? `${mix.givenPct}% given` : null,
    mix.boughtPct > 0 ? `${mix.boughtPct}% bought` : null,
  ].filter((part): part is string => part !== null);
  return parts.join(' · ') || mix.label;
}
