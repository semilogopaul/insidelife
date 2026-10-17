import { describe, expect, it } from 'vitest';
import { LagosOnlyCityTravel } from './city-travel.port.js';

describe('LagosOnlyCityTravel (stand-in until the multi-city work is wired)', () => {
  const port = new LagosOnlyCityTravel();

  it('knows only the Lagos terminal', () => {
    expect(port.isAirportOpen('mmia-gat')).toBe(true);
    expect(port.isAirportOpen('naia-gat')).toBe(false);
  });

  it('refuses every flight with a player-friendly error', async () => {
    await expect(port.flyToAirport()).rejects.toMatchObject({ errorCode: 'CITY_NOT_OPEN' });
  });
});
