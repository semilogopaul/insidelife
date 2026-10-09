import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HOST_TREATS, treatServings, type HostingDto, type HostTreatOfferDto, type VisitPersonDto } from '@insidelife/shared';
import { HostMenu, servingLabel } from '../components/HostMenu';

const person = (firstName: string): VisitPersonDto => ({
  id: firstName.toLowerCase(),
  handle: firstName.toLowerCase(),
  firstName,
  lastName: 'Bello',
  gender: 'female',
  appearance: {} as VisitPersonDto['appearance'],
  outfit: {},
});

function hosting(overrides: Partial<HostingDto> = {}, unavailable: Partial<Record<string, string>> = {}): HostingDto {
  const guests = overrides.guests?.length ?? 2;
  const menu: HostTreatOfferDto[] = HOST_TREATS.map((def) => {
    const servings = treatServings(def.per, guests);
    return {
      id: def.id,
      kind: def.kind,
      name: def.name,
      emoji: def.emoji,
      blurb: def.blurb,
      per: def.per,
      unitPrice: def.price,
      servings,
      total: def.price * servings,
      pantryMeals: (def.pantryMeals ?? 0) * servings,
      adultsOnly: def.adultsOnly === true,
      unavailable: unavailable[def.id] ?? null,
    };
  });
  return {
    atHome: true,
    guests: [
      { visitId: 'v1', person: person('Tolu'), adult: true },
      { visitId: 'v2', person: person('Kemi'), adult: true },
    ],
    menu,
    active: [],
    pantryMeals: 20,
    ...overrides,
  };
}

const row = (name: RegExp) => screen.getByText(name).closest('li') as HTMLElement;

describe('HostMenu', () => {
  it('says who is in and lists the menu by section', () => {
    render(<HostMenu hosting={hosting()} cash={1_000_000} serving={null} onServe={vi.fn()} />);
    expect(screen.getByText('Tolu and Kemi')).toBeTruthy();
    for (const section of ['From your kitchen', 'Order in', 'Drinks', 'Something sweet', 'For the road']) {
      expect(screen.getByRole('region', { name: section })).toBeTruthy();
    }
    expect(within(row(/^Suya platter/)).getByText(/for you and 2 guests/)).toBeTruthy();
    expect(within(row(/^Celebration cake/)).getByText(/for the room/)).toBeTruthy();
    expect(within(row(/^Take-home packs/)).getByText(/for 2 guests/)).toBeTruthy();
  });

  it('serves what you tap', () => {
    const onServe = vi.fn();
    render(<HostMenu hosting={hosting()} cash={1_000_000} serving={null} onServe={onServe} />);
    fireEvent.click(within(row(/^Suya platter/)).getByRole('button', { name: /Serve/ }));
    expect(onServe).toHaveBeenCalledWith('suya-platter');
    fireEvent.click(within(row(/^Home-cooked jollof/)).getByRole('button', { name: /Cook for them/ }));
    expect(onServe).toHaveBeenCalledWith('home-cooked');
  });

  it('explains why something can’t be served, and blocks it', () => {
    render(<HostMenu hosting={hosting({}, { beer: 'Not with an under-18 in the house — soft drinks instead' })} cash={20_000} serving={null} onServe={vi.fn()} />);
    const beer = within(row(/^Cold beer/)).getByRole('button', { name: /Serve/ }) as HTMLButtonElement;
    expect(beer.disabled).toBe(true);
    expect(beer.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText(/under-18 in the house/)).toBeTruthy();
    // ₦60,000 × 3 of champagne is more than the cash in hand.
    expect((within(row(/^Champagne/)).getByRole('button', { name: /Serve/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(row(/^Champagne/)).getByText('Not enough cash on you')).toBeTruthy();
  });

  it('marks what’s already on the table and holds the menu while one is being served', () => {
    render(<HostMenu hosting={hosting({ active: [{ treatId: 'pizza', until: 999 }] })} cash={1_000_000} serving="cake" onServe={vi.fn()} />);
    expect(within(row(/^Pizza night/)).getByText('On the table')).toBeTruthy();
    expect((within(row(/^Suya platter/)).getByRole('button', { name: /Serve/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when nobody’s in or you’re not home', () => {
    const { rerender } = render(<HostMenu hosting={hosting({ guests: [] })} cash={0} serving={null} onServe={vi.fn()} />);
    expect(screen.getByText(/Nobody’s inside yet/)).toBeTruthy();
    rerender(<HostMenu hosting={hosting({ atHome: false })} cash={0} serving={null} onServe={vi.fn()} />);
    expect(screen.getByText(/You’re not at home/)).toBeTruthy();
  });

  it('labels servings', () => {
    expect(servingLabel({ per: 'everyone' }, 1)).toBe('for you and 1 guest');
    expect(servingLabel({ per: 'guest' }, 3)).toBe('for 3 guests');
    expect(servingLabel({ per: 'once' }, 3)).toBe('for the room');
  });
});
