import { describe, expect, it } from 'vitest';
import type { DecorPieceDto, DecorSpotDto } from '@insidelife/shared';
import { asPlacedDecor, groupPieces, piecesInRoom, resolvePiece, unplacedPieces } from './decor-pieces';
import { useDecorEdit } from './decor-edit-store';

const spot = (over: Partial<DecorSpotDto> = {}): DecorSpotDto => ({ templateId: 'home-flat', roomId: 'living', x: 0, z: 0, y: 0, rot: 0, wall: null, onId: null, ...over });
const piece = (id: string, itemId: string, variant: string, at: DecorSpotDto | null = null): DecorPieceDto => ({ id, itemId, variant, spot: at, recolours: 0 });

describe('decor pieces', () => {
  it('resolves a piece against the catalog and drops unknown items', () => {
    expect(resolvePiece(piece('a', 'rug-ankara', 'royal', spot()))).toMatchObject({ item: { id: 'rug-ankara' }, variant: { id: 'royal' } });
    expect(resolvePiece(piece('a', 'rug-ankara', 'retired-colour', spot()))?.variant.id).toBe('sunset');
    expect(resolvePiece(piece('a', 'retired-item', 'x', spot()))).toBeNull();
    expect(resolvePiece(piece('a', 'rug-ankara', 'royal'))).toBeNull();
  });

  it('picks out the pieces of one room of one home template', () => {
    const pieces = [
      piece('a', 'rug-ankara', 'royal', spot()),
      piece('b', 'plant-snake', 'white', spot({ roomId: 'kitchen' })),
      piece('c', 'plant-snake', 'white', spot({ templateId: 'home-duplex' })),
      piece('d', 'plant-snake', 'white'),
      piece('e', 'retired-item', 'x', spot()),
    ];
    expect(piecesInRoom(pieces, 'home-flat', 'living').map((entry) => entry.id)).toEqual(['a']);
    expect(piecesInRoom(pieces, 'home-flat', 'kitchen').map((entry) => entry.id)).toEqual(['b']);
    expect(asPlacedDecor(piecesInRoom(pieces, 'home-flat', 'living'))[0]).toMatchObject({ id: 'a', itemId: 'rug-ankara', pose: { x: 0, wall: null } });
  });

  it('treats pieces placed in another kind of home as not in use here', () => {
    const pieces = [piece('a', 'rug-ankara', 'royal', spot()), piece('b', 'plant-snake', 'white'), piece('c', 'plant-snake', 'white', spot({ templateId: 'home-mansion' }))];
    expect(unplacedPieces(pieces, 'home-flat').map((entry) => entry.id)).toEqual(['b', 'c']);
  });

  it('groups the inventory by item and finish', () => {
    const pieces = [piece('a', 'plant-snake', 'white'), piece('b', 'plant-snake', 'white'), piece('c', 'plant-snake', 'black'), piece('d', 'rug-ankara', 'royal'), piece('e', 'retired', 'x')];
    const groups = groupPieces(pieces);
    expect(groups.map((group) => [group.item.id, group.variant.id, group.pieces.length])).toEqual([
      ['plant-snake', 'white', 2],
      ['plant-snake', 'black', 1],
      ['rug-ankara', 'royal', 1],
    ]);
  });
});

describe('decorate mode state', () => {
  it('holds a piece, selects a placed one, and turns the held piece in steps', () => {
    const store = useDecorEdit.getState();
    store.enter();
    expect(useDecorEdit.getState()).toMatchObject({ active: true, holdingId: null, selectedId: null });
    store.hold('p1');
    store.turnHeld(45);
    store.turnHeld(-90);
    expect(useDecorEdit.getState()).toMatchObject({ holdingId: 'p1', holdingRot: 315 });
    store.select('p2');
    expect(useDecorEdit.getState()).toMatchObject({ holdingId: null, selectedId: 'p2' });
    store.turnSelected(45);
    store.turnSelected(45);
    expect(useDecorEdit.getState().turnRequest).toEqual({ seq: 2, delta: 45 });
    store.exit();
    expect(useDecorEdit.getState()).toMatchObject({ active: false, selectedId: null, holdingId: null });
  });
});
