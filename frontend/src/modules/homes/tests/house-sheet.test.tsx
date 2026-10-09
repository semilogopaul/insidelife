import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { BuyHouseResultDto, HouseListingDto } from '@insidelife/shared';
import { HouseSheet } from '../components/houses/HouseSheet';

const buyHouse = vi.fn((_listingId: string, options: { onSuccess: (result: BuyHouseResultDto) => void }) =>
  options.onSuccess({ propertyId: 'property-1' } as BuyHouseResultDto),
);
const move = vi.fn((_to: string, options: { onSuccess: () => void }) => options.onSuccess());

vi.mock('../hooks/use-housing', () => ({
  useHousingCommands: () => ({
    buyHouse: { mutate: buyHouse, isPending: false },
    move: { mutate: move, isPending: false },
  }),
  useHousing: () => ({ data: { home: { ownership: 'rented' } } }),
}));
vi.mock('@/common/game/snapshot', () => ({
  useSnapshot: () => ({ data: { wallet: { balance: 100_000_000 } } }),
}));

const listing: HouseListingDto = {
  id: 'house.ikorodu.412.1',
  districtId: 'ikorodu',
  districtName: 'Ikorodu',
  blueprintId: 'bungalow',
  blueprintLabel: '3-bedroom bungalow',
  label: '12 Agric Road',
  title: 'c-of-o',
  titleLabel: 'Certificate of Occupancy',
  plots: 1,
  sizeSqm: 600,
  bedrooms: 3,
  units: 1,
  condition: 85,
  ageYears: 6,
  story: 'Owner is relocating abroad (japa)',
  features: ['Borehole', 'POP ceiling'],
  comfort: 11,
  gridHours: 9,
  floodRisk: 0.15,
  disputeRiskPerYear: 0.01,
  demolitionRiskPerYear: 0,
  expectedAppreciation: 0.07,
  annualRentRoll: 1_900_000,
  valuation: 29_300_000,
  premium: 0.25,
  price: 36_600_000,
  costs: { agency: 1_830_000, legal: 915_000, survey: 549_000, total: 3_294_000 },
  total: 39_894_000,
  affordable: true,
  bought: false,
  availableUntil: 4_000_000,
};

beforeAll(() => {
  // motion's reduced-motion hook reads matchMedia, which jsdom doesn't ship.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe('HouseSheet', () => {
  it('shows the full bill, buys on confirm, then moves in with one tap', () => {
    const onClose = vi.fn();
    render(<HouseSheet listing={listing} onClose={onClose} onSeeProperty={() => undefined} />);

    expect(screen.getByRole('dialog', { name: '3-bedroom bungalow' })).toBeTruthy();
    for (const line of ['House & land', 'Agency fee', 'Legal fee', 'Survey plan'])
      expect(screen.getByText(line)).toBeTruthy();

    // HoldButton: press Enter twice to confirm from the keyboard.
    const hold = screen.getByRole('button', { name: /hold to buy/i });
    fireEvent.keyDown(hold, { key: 'Enter' });
    fireEvent.keyDown(hold, { key: 'Enter' });
    expect(buyHouse).toHaveBeenCalledWith('house.ikorodu.412.1', expect.anything());

    expect(screen.getByText(/your lease ends when you move out/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /move in now/i }));
    expect(move).toHaveBeenCalledWith('property-1', expect.anything());
    expect(onClose).toHaveBeenCalled();
  });

  it('doesn’t offer to buy a house you already bought', () => {
    render(
      <HouseSheet
        listing={{ ...listing, bought: true }}
        onClose={() => undefined}
        onSeeProperty={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /hold to buy/i })).toBeNull();
    expect(screen.getByRole('button', { name: /see my property/i })).toBeTruthy();
  });
});
