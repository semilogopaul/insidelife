'use client';

import { useEffect } from 'react';
import { useDecorEdit } from '@/common/decor';
import type { InteriorTemplate } from '../templates/types';
import { DecorEditor } from './DecorEditor';
import { DecorLayer } from './DecorLayer';
import type { RoomDecor } from './use-room-decor';

/**
 * The decor of the room on screen: drawn for the owner and for visitors, and rearrangeable by the owner in Decorate
 * mode (the editor only exists while that's on).
 */
export function DecorWorld({
  template,
  templateId,
  roomId,
  decor,
}: {
  readonly template: InteriorTemplate;
  readonly templateId: string;
  readonly roomId: string;
  readonly decor: RoomDecor;
}) {
  const active = useDecorEdit((state) => state.active);
  const dragging = useDecorEdit((state) => state.draggingId);
  const editing = active && decor.editable;

  // Another room, another selection.
  useEffect(() => {
    const state = useDecorEdit.getState();
    if (state.active) {
      state.select(null);
      state.hold(null);
      state.setTray(true);
    }
  }, [roomId, templateId]);

  return (
    <group name="decor">
      <DecorLayer pieces={decor.placed} hiddenId={editing ? dragging : null} />
      {editing && <DecorEditor templateId={templateId} roomId={roomId} aircraftId={decor.aircraftId} template={template} placed={decor.placed} own={decor.own} />}
    </group>
  );
}
