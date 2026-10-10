import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FobesEntryDto, FobesListDto, FobesListId, FobesMeDto } from '@insidelife/shared';
import { useUi } from '@/common/game/ui-store';
import { FobesApp } from '../components/FobesApp';
import { mixSummary, moveSpoken, positionLines } from '../services/fobes-format';

const state = vi.hoisted(() => ({ calls: [] as Array<{ list: string; page: number }>, lists: {} as Record<string, unknown>, me: null as unknown }));

vi.mock('../hooks/use-fobes', () => ({
  useFobesList: (list: string, page: number) => {
    state.calls.push({ list, page });
    return { data: state.lists[`${list}:${page}`], isPending: false, isError: false, isFetching: false, error: null, refetch: vi.fn() };
  },
  useFobesMe: () => ({ data: state.me }),
}));

const entry = (rank: number, overrides: Partial<FobesEntryDto> = {}): FobesEntryDto => ({
  rank,
  characterId: `id-${rank}`,
  handle: `player${rank}`,
  firstName: `Ada${rank}`,
  lastName: 'Okafor',
  age: 27,
  title: 'CEO at Okafor Foods',
  statusTier: { id: 'big-man', label: 'Big Man / Big Woman' },
  worth: { exact: null, display: '₦1B+' },
  mix: { selfMadePct: 82, givenPct: 18, boughtPct: 0, source: 'mostly-self-made', label: 'Mostly self-made' },
  exact: false,
  isYou: false,
  move: null,
  ...overrides,
});

const listOf = (list: FobesListId, entries: FobesEntryDto[], overrides: Partial<FobesListDto> = {}): FobesListDto => ({
  list,
  title: list,
  blurb: '',
  page: 1,
  pageSize: 20,
  totalPages: 1,
  total: entries.length,
  entries,
  since: null,
  generatedAt: '2026-10-10T00:00:00Z',
  ...overrides,
});

const me: FobesMeDto = {
  characterId: 'id-me',
  handle: 'me',
  age: 24,
  netWorth: 12_000_000,
  selfMade: 7_000_000,
  mix: { selfMadePct: 58, givenPct: 42, boughtPct: 0, source: 'mixed', label: 'Earned, given and bought' },
  showExactWealth: false,
  richList: { list: 'rich-list', rank: 2341, inTop: false, worth: 12_000_000, next: { rank: 100, gap: { exact: 1_200_000_000, display: '₦1.2B' } } },
  selfMadeList: { list: 'self-made', rank: 42, inTop: true, worth: 7_000_000, next: { rank: 41, gap: { exact: null, display: 'Under ₦100k' } } },
  under30: null,
  week: { change: 2_000_000, pct: 20, since: 0 },
  generatedAt: '2026-10-10T00:00:00Z',
};

beforeEach(() => {
  state.calls = [];
  state.me = me;
  state.lists = {
    'rich-list:1': listOf('rich-list', [entry(1, { worth: { exact: 4_200_000_000, display: '₦4.2B' }, exact: true }), entry(2), entry(3, { isYou: true })], { totalPages: 5, total: 100 }),
    'rich-list:2': listOf('rich-list', [entry(21)], { page: 2, totalPages: 5, total: 100 }),
    'risers:1': listOf('risers', [entry(1, { move: { change: null, pct: 34, display: '+34%', rankBefore: 12, newEntry: false } })], { since: 0 }),
  };
  useUi.setState({ phoneOpen: true, phoneApp: 'fobes', phoneParam: null });
});

describe('FobesApp', () => {
  it('puts #1 on the cover and lists the rest with privacy-aware figures', () => {
    render(<FobesApp />);
    const cover = screen.getByRole('article', { name: 'Cover: number 1 on The Lagos Rich List' });
    expect(within(cover).getByText('₦4.2B')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'The Lagos Rich List, page 1' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByText('₦1B+')).toHaveLength(2);
    expect(within(list).getByText('(you)')).toBeTruthy();
    expect(within(list).getAllByRole('img', { name: 'How they made it: 82% self-made · 18% given' })).toHaveLength(2);
  });

  it('opens a person’s Gist profile by handle', () => {
    render(<FobesApp />);
    fireEvent.click(screen.getByRole('button', { name: /Ada2 Okafor/ }));
    expect(useUi.getState()).toMatchObject({ phoneApp: 'gist', phoneParam: '@player2' });
  });

  it('pages through the top 100 and starts again on a new tab', () => {
    render(<FobesApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 5')).toBeTruthy();
    expect(screen.queryByRole('article')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Movers' }));
    expect(state.calls.at(-1)).toEqual({ list: 'risers', page: 1 });
    expect(screen.getByText('Up 34%')).toBeTruthy();
    expect(screen.getByText(/Was #12/)).toBeTruthy();
  });

  it('pins your rank even outside the top 100, with the gap to get in', () => {
    render(<FobesApp />);
    const you = screen.getByRole('region', { name: 'Your position' });
    expect(within(you).getByText('You’re #2,341')).toBeTruthy();
    expect(within(you).getByText(/₦1.2B to the top 100 · Your week/)).toBeTruthy();
    expect(within(you).getByText(/Others see your band/)).toBeTruthy();
  });
});

describe('Fobes wording', () => {
  it('says where you stand on each list', () => {
    expect(positionLines(me.selfMadeList)).toEqual({ headline: 'You’re #42', detail: 'Under ₦100k to pass #41' });
    expect(positionLines({ list: 'rich-list', rank: 1, inTop: true, worth: 1, next: null }).detail).toMatch(/Top of Lagos/);
    expect(positionLines({ list: 'self-made', rank: null, inTop: false, worth: 0, next: null }).headline).toBe('Not on this list yet');
  });

  it('speaks moves and mixes in words', () => {
    expect(moveSpoken({ change: -3_400_000, pct: -12.5, display: '-₦3.4M', rankBefore: 9, newEntry: false })).toBe('Down ₦3.4M');
    expect(moveSpoken({ change: null, pct: null, display: 'New entry', rankBefore: null, newEntry: true })).toBe('New entry');
    expect(mixSummary({ selfMadePct: 0, givenPct: 0, boughtPct: 0, source: 'none', label: 'Nothing to count yet' })).toBe('Nothing to count yet');
  });
});
