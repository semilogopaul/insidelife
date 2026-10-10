import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VEHICLES, type VehicleCatalogEntryDto } from '@insidelife/shared';

const [onLot, elsewhere] = [VEHICLES.find((v) => v.grade === 'brand-new') ?? VEHICLES[1]!, VEHICLES.find((v) => v.grade === 'naija-used') ?? VEHICLES[0]!];
const entry = (vehicle: (typeof VEHICLES)[number], buyHere: boolean, dealerIds: string[]): VehicleCatalogEntryDto =>
  ({ vehicle, price: vehicle.price, deliveryFee: 50_000, paintFees: {}, dealerIds, buyHere }) as VehicleCatalogEntryDto;
const catalogue = [entry(elsewhere, false, ['berger-car-market']), entry(onLot, true, ['lekki-car-mart'])];

vi.mock('@/common/game/snapshot', () => ({ useSnapshot: () => ({ data: { wallet: { cash: 100_000_000 }, character: { id: 'me' } } }) }));

import { DealerTab } from '../components/dealer/DealerTab';

describe('dealer lot labels', () => {
  it('lists this lot first and says plainly that the others are delivery only', () => {
    render(<QueryClientProvider client={new QueryClient()}><DealerTab data={{ catalogue, atDealer: 'lekki-car-mart' } as never} /></QueryClientProvider>);
    const cards = screen.getAllByRole('listitem').filter((item) => within(item).queryByRole('button', { name: /Buy and drive off|Order delivery/ }));
    expect(within(cards[0]!).getByRole('button', { name: 'Buy and drive off' })).toBeTruthy();
    expect(within(cards[1]!).getByRole('button', { name: 'Order delivery' })).toBeTruthy();
    expect(within(cards[1]!).getByText(/buy it at Berger Car Mart/)).toBeTruthy();
  });
});
