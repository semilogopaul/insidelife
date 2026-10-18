import { beforeEach, describe, expect, it } from 'vitest';
import type { DecorPieceDto, FurniturePurchaseDto } from '@insidelife/shared';
import { useDecorEdit, UNDO_DEPTH } from './decor-edit-store';
import { arrivalMessage, offerReplace, useReplaceOffer, whereIs } from './replace-offer';

const piece = (id: string, itemId: string, roomId: string | null): DecorPieceDto => ({
  id,
  itemId,
  variant: 'burgundy',
  recolours: 0,
  spot: roomId ? { templateId: 'home-mansion', roomId, x: 0, z: 0, y: 0, rot: 0, wall: null, onId: null } : null,
});

describe('decorate mode: undo', () => {
  beforeEach(() => useDecorEdit.getState().enter());

  it('remembers changes and takes the last one back first', () => {
    const edit = useDecorEdit.getState();
    edit.remember({ pieceId: 'a', was: null });
    edit.remember({ pieceId: 'b', was: { templateId: 'home-flat', roomId: 'living', x: 1, z: 2, rot: 0 } });
    expect(useDecorEdit.getState().history).toHaveLength(2);
    expect(useDecorEdit.getState().popUndo()).toMatchObject({ pieceId: 'b' });
    expect(useDecorEdit.getState().popUndo()).toMatchObject({ pieceId: 'a', was: null });
    expect(useDecorEdit.getState().popUndo()).toBeNull();
  });

  it('keeps only the last few changes and forgets a piece that was sold', () => {
    const edit = useDecorEdit.getState();
    for (let i = 0; i < UNDO_DEPTH + 5; i++) edit.remember({ pieceId: `p${i}`, was: null });
    expect(useDecorEdit.getState().history).toHaveLength(UNDO_DEPTH);
    useDecorEdit.getState().forgetPiece(`p${UNDO_DEPTH + 4}`);
    expect(useDecorEdit.getState().history.some((entry) => entry.pieceId === `p${UNDO_DEPTH + 4}`)).toBe(false);
    useDecorEdit.getState().enter();
    expect(useDecorEdit.getState().history).toEqual([]);
  });

  it('carries a placed piece in hand (hidden where it stood) until it is put down or dropped', () => {
    useDecorEdit.getState().select('bed');
    useDecorEdit.getState().carry('bed');
    expect(useDecorEdit.getState()).toMatchObject({ holdingId: 'bed', draggingId: 'bed', selectedId: null });
    useDecorEdit.getState().hold(null);
    expect(useDecorEdit.getState()).toMatchObject({ holdingId: null, draggingId: null });
  });

  it('knows which room of your home is on screen, and tells no one when nothing changed', () => {
    useDecorEdit.getState().setHomeRoom({ templateId: 'home-flat', roomId: 'living' });
    const first = useDecorEdit.getState().homeRoom;
    useDecorEdit.getState().setHomeRoom({ templateId: 'home-flat', roomId: 'living' });
    expect(useDecorEdit.getState().homeRoom).toBe(first);
    useDecorEdit.getState().setHomeRoom(null);
    expect(useDecorEdit.getState().homeRoom).toBeNull();
  });
});

describe('replacing the old one', () => {
  beforeEach(() => useReplaceOffer.getState().close());

  const bought = (replaces: DecorPieceDto[]): FurniturePurchaseDto => ({ pieces: [piece('new', 'home-bed-orthopedic', 'master')], replaces, sellBacks: { old: 34_000 } });

  it('offers only when the new piece outclasses something standing in the home', () => {
    offerReplace(bought([]));
    expect(useReplaceOffer.getState().offer).toBeNull();
    offerReplace(undefined);
    expect(useReplaceOffer.getState().offer).toBeNull();
    offerReplace(bought([piece('old', 'home-bed-foam-mattress', 'master')]));
    expect(useReplaceOffer.getState().offer).toMatchObject({ newPiece: { id: 'new' }, olds: [{ id: 'old' }], sellBacks: { old: 34_000 } });
  });

  it('closes once every old piece is dealt with', () => {
    offerReplace(bought([piece('old', 'home-bed-foam-mattress', 'master'), piece('older', 'home-bed-spring', 'master')]));
    useReplaceOffer.getState().drop('old');
    expect(useReplaceOffer.getState().offer?.olds.map((entry) => entry.id)).toEqual(['older']);
    useReplaceOffer.getState().drop('older');
    expect(useReplaceOffer.getState().offer).toBeNull();
  });

  it('says where a piece stands, in words', () => {
    expect(whereIs(piece('a', 'home-bed-spring', 'master'))).toBe('in the master suite');
    expect(whereIs(piece('a', 'home-bed-spring', null))).toBe('in storage');
    expect(arrivalMessage({ pieces: [piece('a', 'home-dining-set', 'kitchen')], replaces: [], sellBacks: {} }, 'Dining set')).toMatch(/in the kitchen/);
    expect(arrivalMessage({ pieces: [piece('a', 'home-dining-set', null)], replaces: [], sellBacks: {} }, 'Dining set')).toMatch(/storage/);
    expect(arrivalMessage(undefined, 'Fridge')).toBe('Fridge is in your things now.');
  });
});
