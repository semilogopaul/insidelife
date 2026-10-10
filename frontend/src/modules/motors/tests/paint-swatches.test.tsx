import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VEHICLES } from '@insidelife/shared';
import { PaintSwatches } from '../components/dealer/PaintSwatches';

describe('car colours', () => {
  it('every car can be ordered in pink', () => {
    expect(VEHICLES.every((vehicle) => vehicle.paints.includes('hot-pink') && vehicle.paints.includes('baby-pink'))).toBe(true);
  });

  it('shows the signature colours first, then all of them on request', () => {
    const car = VEHICLES[0]!;
    render(<PaintSwatches label="Paint" paints={car.paints} value={car.defaultPaint} onChange={() => undefined} />);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: /colours/ }));
    expect(screen.getAllByRole('radio')).toHaveLength(car.paints.length);
    expect(screen.getByRole('radio', { name: /Hot pink/ })).toBeTruthy();
  });
});
