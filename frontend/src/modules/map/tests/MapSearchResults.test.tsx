import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VENUES } from '@insidelife/shared';
import { MapSearchHints, MapSearchResults } from '../components/MapSearchResults';
import { searchVenues } from '../services/search';

afterEach(cleanup);

const props = (query: string, hour = 12) => ({
  query,
  groups: searchVenues(query, VENUES, { fromDistrict: 'yaba', cityId: 'lagos' }),
  cityId: 'lagos' as const,
  fromDistrict: 'yaba' as const,
  hour,
  scopeLabel: null,
  onSelect: vi.fn(),
  onSuggest: vi.fn(),
  onSearchAll: vi.fn(),
  onFly: vi.fn(),
});

describe('MapSearchResults', () => {
  it('lists matches with district and distance, announces the count, and opens a tapped place', () => {
    const p = props('hotel');
    render(<MapSearchResults {...p} />);
    expect(screen.getByRole('status').textContent).toMatch(/places? found, \d+ in Abuja/);
    const first = screen.getByTestId('map-search-here').querySelector('button')!;
    expect(first.textContent).toMatch(/km away|Nearby/);
    fireEvent.click(first);
    expect(p.onSelect).toHaveBeenCalledWith(p.groups.here[0]!.venue.id);
  });

  it('groups the other city apart with a fly-or-bus action', () => {
    const p = props('hotel');
    render(<MapSearchResults {...p} />);
    expect(screen.getByTestId('map-search-other').textContent).toContain('In Abuja');
    fireEvent.click(screen.getByRole('button', { name: 'Fly or take the bus' }));
    expect(p.onFly).toHaveBeenCalled();
  });

  it('says when a place is closed and when it opens', () => {
    render(<MapSearchResults {...props('ikeja city mall', 3)} />);
    expect(screen.getByText('Closed now · opens 9 AM')).toBeTruthy();
  });

  it('shows an empty state with suggestions', () => {
    const p = props('qzxjv');
    render(<MapSearchResults {...p} />);
    expect(screen.getByTestId('map-search-empty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'hotel' }));
    expect(p.onSuggest).toHaveBeenCalledWith('hotel');
  });

  it('offers to search everything when a chip hides the matches', () => {
    const p = { ...props('qzxjv'), scopeLabel: 'Food' };
    render(<MapSearchResults {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search all places' }));
    expect(p.onSearchAll).toHaveBeenCalled();
  });

  it('moves between results with the arrow keys', () => {
    render(<MapSearchResults {...props('hotel')} />);
    const buttons = screen.getByTestId('map-search-here').querySelectorAll('button');
    buttons[0]!.focus();
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('suggests searches before anything is typed', () => {
    const onSuggest = vi.fn();
    render(<MapSearchHints onSuggest={onSuggest} />);
    fireEvent.click(screen.getByRole('button', { name: 'suya' }));
    expect(onSuggest).toHaveBeenCalledWith('suya');
  });
});
