import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SPRAY_RULES } from '@insidelife/shared';
import { DJ_TARGET, SprayPad, type SprayTarget } from '../components/spray/SprayPad';

const TOBI: SprayTarget = { handle: 'tobi_vi', firstName: 'Tobi', lastName: 'Bello', tag: 'friend' };

function pad(overrides: Partial<Parameters<typeof SprayPad>[0]> = {}) {
  const onSpray = vi.fn();
  render(<SprayPad targets={[TOBI, DJ_TARGET]} cash={100_000} total={0} where="at Quilox tonight" heading="Spray who?" empty="Nobody." onSpray={onSpray} {...overrides} />);
  return onSpray;
}

describe('SprayPad', () => {
  it('sprays the first person by default', () => {
    const onSpray = pad();
    fireEvent.click(screen.getByRole('button', { name: /Spray ₦5,000/ }));
    expect(onSpray).toHaveBeenCalledWith('tobi_vi', 5_000);
  });

  it('can spray the DJ (no handle)', () => {
    const onSpray = pad();
    fireEvent.click(screen.getByRole('radio', { name: /The DJ/ }));
    expect(screen.getByText('on the DJ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Spray ₦5,000/ }));
    expect(onSpray).toHaveBeenCalledWith(null, 5_000);
  });

  it('won’t spray more than the cash in hand or past the night’s cap', () => {
    pad({ cash: 2_000 });
    expect((screen.getByRole('button', { name: /Spray ₦5,000/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('counts the cap from what you already sprayed here', () => {
    pad({ total: SPRAY_RULES.maxPerParty - 1_000 });
    expect((screen.getByRole('button', { name: /Spray ₦5,000/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/at Quilox tonight/)).toBeTruthy();
  });

  it('says so when there’s nobody to spray', () => {
    pad({ targets: [], empty: 'Nobody else is here to spray yet.' });
    expect(screen.getByText('Nobody else is here to spray yet.')).toBeTruthy();
  });
});
