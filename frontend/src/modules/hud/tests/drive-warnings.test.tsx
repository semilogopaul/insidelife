import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SERVICE_POINTS, serviceLocationId, vehicleWarnings, type VehicleWarning } from '@insidelife/shared';
import { useNavigation } from '@/common/game/navigation-store';
import { useUi } from '@/common/game/ui-store';
import { useWorld, type DriveTelemetry } from '@/common/game/world-store';
import { DriveAlert } from '../components/DriveAlert';
import { DrivePanel } from '../components/DrivePanel';

const warning = (state: Parameters<typeof vehicleWarnings>[0]): VehicleWarning => {
  const first = vehicleWarnings(state)[0];
  if (!first) throw new RangeError('no warning');
  return first;
};

const telemetry = (overrides: Partial<DriveTelemetry> = {}): DriveTelemetry => ({
  speedKmh: 42,
  fuelLitres: 30,
  tankLitres: 45,
  rangeKm: 330,
  condition: 80,
  engineOff: false,
  warning: null,
  ...overrides,
});

describe('driving HUD', () => {
  const station = SERVICE_POINTS.find((point) => point.kind === 'fuel');
  const mechanic = SERVICE_POINTS.find((point) => point.kind === 'mechanic');
  beforeEach(() => {
    useNavigation.getState().setDestination(null);
    useUi.setState({ phoneOpen: false });
    if (station) useWorld.setState({ position: station.entrance.position });
  });

  it('shows the fuel gauge with the km left, and the engine light when it needs a service', () => {
    const { rerender } = render(<DrivePanel drive={telemetry()} />);
    const meter = screen.getByRole('meter', { name: 'Fuel' });
    expect(meter.getAttribute('aria-valuenow')).toBe('30');
    expect(screen.getByText('330 km')).toBeTruthy();
    expect(screen.queryByLabelText('Engine light on')).toBeNull();
    rerender(<DrivePanel drive={telemetry({ condition: 55 })} />);
    expect(screen.getByLabelText('Engine light on')).toBeTruthy();
  });

  it('warns early about fuel, with GPS to the nearest filling station', () => {
    render(<DriveAlert warning={warning({ fuelLitres: 1.1, tankLitres: 45, rangeKm: 12, condition: 80, brokenDown: false })} />);
    expect(screen.getByRole('status').textContent).toContain('Fuel low: 12 km left');
    fireEvent.click(screen.getByRole('button', { name: /GPS to/ }));
    expect(useNavigation.getState().destinationId).toBe(station ? serviceLocationId(station) : null);
  });

  it('says "service soon" and points at a mechanic, no phone needed yet', () => {
    render(<DriveAlert warning={warning({ fuelLitres: 30, tankLitres: 45, rangeKm: 330, condition: 55, brokenDown: false })} />);
    expect(screen.getByRole('status').textContent).toContain('Engine light on: service soon');
    fireEvent.click(screen.getByRole('button', { name: /GPS to/ }));
    expect(useNavigation.getState().destinationId?.startsWith('service:mechanic:')).toBe(true);
    expect(mechanic).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Motors/ })).toBeNull();
  });

  it('offers help from Motors when the car can’t go', () => {
    render(<DriveAlert warning={warning({ fuelLitres: 30, tankLitres: 45, rangeKm: 330, condition: 40, brokenDown: true })} />);
    expect(screen.getByRole('status').textContent).toContain('Broken down');
    fireEvent.click(screen.getByRole('button', { name: 'Call a mechanic in Motors' }));
    expect(useUi.getState()).toMatchObject({ phoneOpen: true, phoneApp: 'motors' });
  });
});
