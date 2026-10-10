import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BET_SELECTION_IDS, type BetFixtureDto, type BetQuoteDto, type BettingAccountDto, type BettingClubDto, type BettingLeagueDto } from '@insidelife/shared';
import { SlipDrawer } from '../components/SlipDrawer';
import { liveState, pickLabel } from '../services/betting-format';
import { DEFAULT_STAKE, useSlip } from '../services/slip-store';

const state = vi.hoisted(() => ({
  quote: undefined as unknown,
  quoteCalls: [] as Array<{ legs: unknown; stake: number }>,
  mutate: vi.fn(),
  placeError: null as unknown,
}));

vi.mock('../hooks/use-betting', () => ({
  useSlipQuote: (legs: unknown, stake: number) => {
    state.quoteCalls.push({ legs, stake });
    return { data: state.quote, isFetching: false };
  },
  usePlaceBet: () => ({ mutate: state.mutate, isPending: false, error: state.placeError }),
}));

const odds = Object.fromEntries(BET_SELECTION_IDS.map((id) => [id, 1.85])) as BetFixtureDto['odds'];
const club = (id: string, name: string): BettingClubDto => ({ id, name, code: name.slice(0, 3).toUpperCase(), colors: ['#000000', '#ffffff'], home: 'Lagos' });
const clubs = new Map([club('enyimba', 'Enyimba'), club('mfm', 'MFM FC'), club('remo', 'Remo Stars'), club('lobi', 'Lobi Stars')].map((c) => [c.id, c]));
const league: BettingLeagueDto = {
  appName: 'Odogwu Odds',
  leagueName: 'The Lagos League',
  now: 0,
  clubs: [...clubs.values()],
  upcoming: [
    {
      round: 7,
      season: 0,
      week: 7,
      kickoffAt: 1_680,
      fixtures: [
        { matchId: '7-0', homeId: 'enyimba', awayId: 'mfm', kickoffAt: 1_680, odds },
        { matchId: '7-1', homeId: 'remo', awayId: 'lobi', kickoffAt: 1_680, odds },
      ],
    },
  ],
  live: null,
};
const account = { limits: { maxStake: 1_000_000, dailyLossLimit: 5_000_000 }, today: { lossLeft: 4_000_000 } } as unknown as BettingAccountDto;

const quote = (overrides: Partial<BetQuoteDto> = {}): BetQuoteDto => {
  const { picks, stake } = useSlip.getState();
  return {
    legs: picks.map((pick) => ({
      matchId: pick.matchId,
      round: 7,
      homeId: 'enyimba',
      awayId: 'mfm',
      kickoffAt: 1_680,
      market: '1x2',
      selection: pick.selection,
      label: '',
      odds: 2.4,
      result: 'pending',
      score: null,
    })),
    stake,
    totalOdds: 7.77,
    potentialReturns: 3_885,
    capped: false,
    problem: null,
    ...overrides,
  };
};

beforeEach(() => {
  useSlip.setState({ picks: [], stake: DEFAULT_STAKE });
  state.quote = undefined;
  state.quoteCalls = [];
  state.mutate = vi.fn();
  state.placeError = null;
});

describe('the slip (client state)', () => {
  it('keeps one pick per match: another selection swaps it, the same one removes it', () => {
    const { toggle } = useSlip.getState();
    toggle('7-0', '1x2:home');
    toggle('7-1', 'btts:yes');
    toggle('7-0', '1x2:draw');
    expect(useSlip.getState().picks).toEqual([
      { matchId: '7-0', selection: '1x2:draw' },
      { matchId: '7-1', selection: 'btts:yes' },
    ]);
    toggle('7-0', '1x2:draw');
    expect(useSlip.getState().picks).toEqual([{ matchId: '7-1', selection: 'btts:yes' }]);
  });

  it('stops at ten picks and drops picks whose match kicked off', () => {
    const { toggle, keepOnly } = useSlip.getState();
    for (let i = 0; i < 12; i++) toggle(`${i < 8 ? 7 : 8}-${i % 8}`, '1x2:home');
    expect(useSlip.getState().picks).toHaveLength(10);
    keepOnly(new Set(['8-0', '8-1']));
    expect(useSlip.getState().picks.map((pick) => pick.matchId)).toEqual(['8-0', '8-1']);
  });
});

describe('SlipDrawer', () => {
  it('shows the server’s odds and returns, never its own sums', () => {
    useSlip.setState({ picks: [{ matchId: '7-0', selection: '1x2:home' }, { matchId: '7-1', selection: 'ou25:over' }], stake: 500 });
    state.quote = quote();
    render(<SlipDrawer league={league} clubs={clubs} account={account} />);
    // 1.85 × 1.85 × ₦500 would be ₦1,711: the drawer prints what the server said instead.
    expect(screen.getByRole('button', { name: /2-leg accumulator/ }).textContent).toContain('7.77');
    fireEvent.click(screen.getByRole('button', { name: /Open slip/ }));
    const dialog = screen.getByRole('dialog', { name: 'Your slip' });
    expect(within(dialog).getByText('7.77')).toBeTruthy();
    expect(within(dialog).getByText('₦3,885')).toBeTruthy();
    expect(within(dialog).getByText('Enyimba to win')).toBeTruthy();
    expect(within(dialog).getByText(/no cash value/i)).toBeTruthy();
    expect(state.quoteCalls.at(-1)).toEqual({ legs: useSlip.getState().picks, stake: 500 });
  });

  it('never says you can lose more than the daily limit (a winning day included)', () => {
    useSlip.setState({ picks: [{ matchId: '7-0', selection: '1x2:home' }], stake: 500 });
    state.quote = quote();
    const winningDay = { ...account, today: { lossLeft: 5_000_100 } } as unknown as BettingAccountDto;
    render(<SlipDrawer league={league} clubs={clubs} account={winningDay} />);
    fireEvent.click(screen.getByRole('button', { name: /Open slip/ }));
    const hint = document.getElementById('bet-stake-hint')?.textContent ?? '';
    expect(hint).toContain('₦5,000,000 daily loss limit, ₦5,000,000 left today');
    expect(hint).not.toContain('5,000,100');
  });

  it('asks the server again when the stake changes, and only arms the button for the current stake', () => {
    useSlip.setState({ picks: [{ matchId: '7-0', selection: '1x2:away' }], stake: 500 });
    state.quote = quote();
    render(<SlipDrawer league={league} clubs={clubs} account={account} />);
    fireEvent.click(screen.getByRole('button', { name: /Open slip/ }));
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '2,500' } });
    expect(useSlip.getState().stake).toBe(2_500);
    expect(state.quoteCalls.at(-1)?.stake).toBe(2_500);
    // The last quote was for ₦500: until the server prices ₦2,500 there's nothing to place.
    expect((screen.getByRole('button', { name: /Place bet/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '₦1,000' }));
    expect(useSlip.getState().stake).toBe(1_000);
  });

  it('refuses to place while the server says no, and says why', () => {
    useSlip.setState({ picks: [{ matchId: '7-0', selection: '1x2:home' }], stake: 500 });
    state.quote = quote({ problem: 'You’ve reached your daily loss limit of ₦5,000,000.' });
    render(<SlipDrawer league={league} clubs={clubs} account={account} />);
    fireEvent.click(screen.getByRole('button', { name: /Open slip/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/daily loss limit/);
    const place = screen.getByRole('button', { name: /Place bet/ }) as HTMLButtonElement;
    expect(place.disabled).toBe(true);
  });

  it('sends the bet and empties the slip when it goes through', () => {
    useSlip.setState({ picks: [{ matchId: '7-1', selection: 'btts:no' }], stake: 1_000 });
    state.quote = quote();
    state.mutate = vi.fn((_variables: unknown, options: { onSuccess: (result: unknown) => void }) =>
      options.onSuccess({ slip: { stake: 1_000, totalOdds: 7.77 }, balanceAfter: 9_000 }),
    );
    render(<SlipDrawer league={league} clubs={clubs} account={account} />);
    fireEvent.click(screen.getByRole('button', { name: /Open slip/ }));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Place bet · ₦1,000/ }));
    });
    expect(state.mutate).toHaveBeenCalledWith({ legs: [{ matchId: '7-1', selection: 'btts:no' }], stake: 1_000 }, expect.anything());
    expect(useSlip.getState().picks).toEqual([]);
  });
});

describe('betting words and the live scoreboard', () => {
  it('names picks for the fixture', () => {
    expect(pickLabel('dc:x2', 'Enyimba', 'MFM FC')).toBe('MFM FC or draw');
    expect(pickLabel('btts:yes', 'Enyimba', 'MFM FC')).toBe('Both teams score (GG)');
  });

  it('counts goals only once their minute has come', () => {
    const match = {
      matchId: '7-0',
      homeId: 'enyimba',
      awayId: 'mfm',
      kickoffAt: 0,
      fullTimeAt: 93,
      home: 2,
      away: 1,
      goals: [
        { side: 'home', minute: 12, at: 11.5 },
        { side: 'away', minute: 50, at: 52.5 },
        { side: 'home', minute: 88, at: 90.5 },
      ],
    } as const;
    expect(liveState(match, 30)).toMatchObject({ home: 1, away: 0, label: "31'" });
    expect(liveState(match, 46)).toMatchObject({ home: 1, away: 0, label: 'HT' });
    expect(liveState(match, 93)).toMatchObject({ home: 2, away: 1, label: 'FT' });
  });
});
