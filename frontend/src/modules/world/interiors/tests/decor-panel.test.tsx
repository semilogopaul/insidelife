import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { homeFurnishing, homeLocationId, type DecorPieceDto, type DecorStateDto } from '@insidelife/shared';
import { FLAT_LAYOUT } from '../layouts/catalog';

const mutations = vi.hoisted(() => ({
  putBack: { mutate: vi.fn(), isPending: false },
  recolour: { mutate: vi.fn(), isPending: false },
  sell: { mutate: vi.fn(), isPending: false },
  place: { mutate: vi.fn(), isPending: false },
  arrange: { mutate: vi.fn(), isPending: false },
  buyFurniture: { mutate: vi.fn(), isPending: false },
  purchase: { mutate: vi.fn(), isPending: false },
  replace: { mutate: vi.fn(), isPending: false },
}));
const decorState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/common/game/snapshot', () => ({ useSnapshot: () => ({ data: { character: { id: 'me' } } }) }));
vi.mock('@/common/decor', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    useDecor: () => ({ data: decorState.current }),
    useAircraftDecor: () => ({ data: undefined }),
    useDecorCommands: () => mutations,
  };
});

const { DecorPanel } = await import('../decor/DecorOverlay');
const { useDecorEdit } = await import('@/common/decor');
const { useHomeView } = await import('../walk/home-view-store');

const spot = (roomId: string, x = 0, z = 0) => ({ templateId: 'home-flat', roomId, x, z, y: 0, rot: 0, wall: null, onId: null });
const piece = (id: string, itemId: string, roomId: string | null, variant = 'burgundy'): DecorPieceDto => ({ id, itemId, variant, recolours: 0, spot: roomId ? spot(roomId) : null });

function stateWith(pieces: DecorPieceDto[], scope: 'full' | 'small' = 'full'): DecorStateDto {
  return {
    pieces,
    prices: { 'home-bed-spring': 420_000, 'home-dining-set': 1_100_000, 'home-sofa-fabric': 650_000, 'home-tv-32': 170_000, 'home-bed-foam-mattress': 85_000 },
    recolourPrices: { 'home-bed-spring': 63_000 },
    home: { eligible: true, reason: null, scope, templateId: 'home-flat', ownership: scope === 'small' ? 'family' : 'rented' },
    limits: { perRoom: 24, owned: 160 },
    sellBacks: Object.fromEntries(pieces.map((entry) => [entry.id, 34_000])),
    furnishing: homeFurnishing('home-flat', []),
    bedQuality: 0.2,
  };
}

function enterFlat(roomId: string): void {
  useHomeView.setState({
    house: `${homeLocationId('me')}|home-flat`,
    layout: FLAT_LAYOUT,
    rooms: FLAT_LAYOUT.rooms.map((room) => ({ id: room.id, label: room.label, level: room.level })),
    roomId,
    camera: 'overview',
  });
  useDecorEdit.getState().enter();
}

beforeEach(() => {
  for (const mutation of Object.values(mutations)) mutation.mutate.mockReset();
});
afterEach(() => {
  cleanup();
  useDecorEdit.getState().exit();
  useHomeView.setState({ house: null, layout: null, rooms: [], roomId: null });
});

describe('Decorate panel', () => {
  it('says what the home is missing and offers the rooms and the furniture store', () => {
    decorState.current = stateWith([]);
    enterFlat('living');
    render(<DecorPanel />);
    expect(screen.getByText('No bed in this home')).toBeTruthy();
    expect(screen.getByText('No table to eat at')).toBeTruthy();
    expect(screen.getByText('Nowhere to sit')).toBeTruthy();
    const rooms = screen.getByRole('navigation', { name: 'Rooms' });
    expect(within(rooms).getAllByRole('button').map((button) => button.textContent)).toEqual(['Living room', 'Kitchen', 'Bedroom', 'Bathroom']);
    expect(within(rooms).getByRole('button', { name: 'Living room' }).getAttribute('aria-current')).toBe('page');
    // Nothing stored: the way to a bed is one tap away.
    fireEvent.click(screen.getByRole('button', { name: /Furniture$/ }));
    expect(useDecorEdit.getState().tray).toBe('furniture');
  });

  it('buys furniture from the tray into the room you are in', () => {
    decorState.current = stateWith([]);
    enterFlat('bedroom');
    useDecorEdit.getState().showTray('furniture');
    render(<DecorPanel />);
    const row = screen.getByText('Spring Bed & Wooden Frame').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Buy' }));
    expect(mutations.buyFurniture.mutate).toHaveBeenCalledWith({ itemId: 'bed-spring', roomId: 'bedroom' }, expect.anything());
    // A thing you already have the most of cannot be bought again.
    cleanup();
    decorState.current = stateWith([piece('p1', 'home-bed-spring', 'bedroom')]);
    enterFlat('bedroom');
    useDecorEdit.getState().showTray('furniture');
    render(<DecorPanel />);
    expect(within(screen.getByText('Spring Bed & Wooden Frame').closest('li')!).getByRole('button', { name: 'Have it' }).hasAttribute('disabled')).toBe(true);
  });

  it('gives a selected piece its big buttons: move, rotate, colour, store and sell', () => {
    decorState.current = stateWith([piece('bed', 'home-bed-spring', 'bedroom')]);
    enterFlat('bedroom');
    useDecorEdit.getState().select('bed');
    render(<DecorPanel />);
    expect(screen.getByText(/Bed · sleeps 55%/)).toBeTruthy();
    for (const label of ['Move', 'Rotate', 'Colour', 'Store', 'Sell']) expect(screen.getByRole('button', { name: label })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    expect(useDecorEdit.getState().turnRequest?.delta).toBe(45);

    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(useDecorEdit.getState()).toMatchObject({ holdingId: 'bed', draggingId: 'bed' });
  });

  it('stores a piece (and can undo it), and asks before selling', () => {
    decorState.current = stateWith([piece('bed', 'home-bed-spring', 'bedroom')]);
    enterFlat('bedroom');
    useDecorEdit.getState().select('bed');
    render(<DecorPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Store' }));
    expect(mutations.putBack.mutate).toHaveBeenCalledWith('bed');
    expect(useDecorEdit.getState().history).toHaveLength(1);
    expect(useDecorEdit.getState().history[0]).toMatchObject({ pieceId: 'bed', was: { roomId: 'bedroom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo the last change' }));
    expect(mutations.place.mutate).toHaveBeenCalledWith(expect.objectContaining({ pieceId: 'bed', request: expect.objectContaining({ roomId: 'bedroom' }) }), expect.anything());

    useDecorEdit.getState().select('bed');
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
    expect(screen.getByText(/for/).textContent).toMatch(/₦34,000/);
    expect(mutations.sell.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sell it' }));
    expect(mutations.sell.mutate).toHaveBeenCalledWith('bed', expect.anything());
  });

  it('keeps the family’s furniture and waits big pieces for a place of your own', () => {
    decorState.current = stateWith([piece('bed', 'home-bed-spring', null), piece('plant', 'plant-snake', null, 'terracotta')], 'small');
    enterFlat('living');
    render(<DecorPanel />);
    expect(screen.getByText(/The family’s furniture stays where it is/)).toBeTruthy();
    // Only the small piece can be picked up; the bed is waiting.
    expect(screen.getByText('Snake plant')).toBeTruthy();
    expect(screen.queryByText('Spring Bed & Wooden Frame')).toBeNull();
    // No nagging checklist in somebody else's house.
    expect(screen.queryByText('No bed in this home')).toBeNull();
  });
});
