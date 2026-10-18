'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
  type Group,
  type Mesh,
} from 'three';
import {
  checkAircraftDecorPlacement,
  checkDecorPlacement,
  decorRect,
  findAircraftDecorRoom,
  findDecorItem,
  findDecorRoom,
  findDecorVariant,
  furnitureRoomIssue,
  isSmallPiece,
  type DecorItem,
  type DecorPieceDto,
  type DecorPose,
  type DecorRoom,
  type DecorVariant,
  type PlacedDecor,
  type PlacementVerdict,
} from '@insidelife/shared';
import { asPlacedDecor, useDecor, useDecorCommands, useDecorEdit, type PlacedPiece } from '@/common/decor';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { createSurfaceMaterial } from '@/common/three/materials/surface-material';
import type { InteriorTemplate } from '../templates/types';
import { resolveDrop, type Drop, type DropTarget } from './decor-drop';
import { pickNearest, rayAtHeight, rayOnSurface, rayWallPoint } from './decor-pick';
import { buildGhostGeometry, drawableOf, pickBoxOf } from './decor-scene';
import { fixturesOf, wallMountsOf, type Fixture, type WallMount } from './fixtures';

/** A press that moves less than this (px) is a tap. */
const TAP_SLOP_PX = 7;
const OK = '#35c46a';
const NOT_OK = '#ef4444';
const SELECT = '#f6b90b';

interface Live {
  readonly room: DecorRoom;
  readonly templateId: string;
  readonly roomId: string;
  readonly aircraftId: string | undefined;
  readonly placed: readonly PlacedPiece[];
  readonly own: readonly DecorPieceDto[];
  readonly fixtures: readonly Fixture[];
  readonly mounts: readonly WallMount[];
  readonly place: ReturnType<typeof useDecorCommands>['place'];
  /** The family house and hostels take small pieces only. */
  readonly small: boolean;
}

type Press =
  | { readonly mode: 'place'; readonly pointerId: number; readonly id: string; moved: boolean; readonly x: number; readonly y: number }
  | { readonly mode: 'move'; readonly pointerId: number; readonly id: string; moved: boolean; readonly x: number; readonly y: number }
  | { readonly mode: 'empty'; readonly pointerId: number; moved: boolean; readonly x: number; readonly y: number };

interface Held {
  readonly item: DecorItem;
  readonly variant: DecorVariant;
  readonly id: string;
  readonly rot: number;
  readonly autoFace: boolean;
}

/**
 * Decorate mode in the room: tap an inventory piece, then the floor, a wall or a table to put it down (drag to find the
 * spot: a ghost shows green where it fits and red where it doesn't, snapping to walls, the grid and neighbours); tap a
 * placed piece to select it and drag it to move it. Pointer work is done on the canvas element with hand-made rays
 * (see `decor-pick`), so orbiting the dollhouse camera keeps working wherever you don't grab a piece.
 */
export function DecorEditor({
  templateId,
  roomId,
  aircraftId,
  template,
  placed,
  own,
}: {
  readonly templateId: string;
  readonly roomId: string;
  /** Set when the room is a cabin of one of your aircraft: placements go to the aircraft, with the cabin's rules. */
  readonly aircraftId?: string;
  readonly template: InteriorTemplate;
  readonly placed: readonly PlacedPiece[];
  readonly own: readonly DecorPieceDto[];
}) {
  const small = useDecor(!aircraftId).data?.home.scope === 'small';
  const room = aircraftId ? findAircraftDecorRoom(templateId, roomId) : findDecorRoom(templateId, roomId, small);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as unknown as { enabled: boolean } | null;
  const holdingId = useDecorEdit((state) => state.holdingId);
  const selectedId = useDecorEdit((state) => state.selectedId);
  const dragging = useDecorEdit((state) => state.draggingId);
  const { place } = useDecorCommands();
  const fixtures = useMemo(() => fixturesOf(template), [template]);
  const mounts = useMemo(() => wallMountsOf(template), [template]);

  const heldPiece = holdingId ? own.find((piece) => piece.id === holdingId) : undefined;
  const selected = selectedId ? placed.find((piece) => piece.id === selectedId) : undefined;
  const source = useMemo(() => {
    if (heldPiece) {
      const item = findDecorItem(heldPiece.itemId);
      const variant = item ? (findDecorVariant(item, heldPiece.variant) ?? item.variants[0]) : undefined;
      return item && variant ? { item, variant } : null;
    }
    return selected ? { item: selected.item, variant: selected.variant } : null;
  }, [heldPiece, selected]);
  const ghostGeometry = useMemo(() => (source ? buildGhostGeometry(source.item, source.variant) : null), [source]);
  const ghostMaterial = useMemo(() => createSurfaceMaterial({ transparent: true, opacity: 0.82 }), []);
  const plateMaterial = useMemo(() => new MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }), []);
  const plateEdges = useMemo(() => new LineBasicMaterial({ color: OK, toneMapped: false }), []);
  const unitBox = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const unitEdges = useMemo(() => new EdgesGeometry(unitBox), [unitBox]);
  const selectEdges = useMemo(() => new LineBasicMaterial({ color: SELECT, toneMapped: false }), []);
  useEffect(
    () => () => {
      ghostGeometry?.dispose();
    },
    [ghostGeometry],
  );
  useEffect(
    () => () => {
      ghostMaterial.dispose();
      plateMaterial.dispose();
      plateEdges.dispose();
      unitBox.dispose();
      unitEdges.dispose();
      selectEdges.dispose();
    },
    [ghostMaterial, plateMaterial, plateEdges, unitBox, unitEdges, selectEdges],
  );

  const ghost = useRef<Group>(null);
  const plate = useRef<Group>(null);
  const plateBox = useRef<Mesh>(null);
  const selection = useRef<Group>(null);
  const live = useRef<Live | null>(null);
  useLayoutEffect(() => {
    live.current = room ? { room, templateId, roomId, aircraftId, placed, own, fixtures, mounts, place, small } : null;
  });

  // The selected piece's outline follows it (it moves when the server answers).
  useLayoutEffect(() => {
    const group = selection.current;
    if (!group) return;
    if (!selected || !room || dragging === selected.id) {
      group.visible = false;
      return;
    }
    const box = pickBoxOf(room, drawableOf(selected));
    group.visible = true;
    group.position.set(box.position[0], box.position[1], box.position[2]);
    group.rotation.y = (box.rot * Math.PI) / 180;
    group.scale.set(box.size[0] + 0.04, box.size[1] + 0.04, box.size[2] + 0.04);
  }, [selected, room, dragging]);

  // Put the ghost's plate under the item being carried.
  useLayoutEffect(() => {
    const mesh = plateBox.current;
    const group = plate.current;
    if (!mesh || !group || !source) return;
    const [w, d] = source.item.footprint;
    const wall = source.item.placement === 'wall';
    mesh.scale.set(w + 0.04, source.item.height, d + 0.04);
    mesh.position.set(0, source.item.height / 2, wall ? d / 2 : 0);
    const edges = group.children[1];
    if (edges) {
      edges.scale.copy(mesh.scale);
      edges.position.copy(mesh.position);
    }
  }, [source]);

  const showGhost = (drop: Drop | null): void => {
    const group = ghost.current;
    if (!group) return;
    if (!drop) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.position.set(drop.pose.x, drop.pose.y, drop.pose.z);
    group.rotation.y = (drop.pose.rot * Math.PI) / 180;
    const color = drop.ok ? OK : NOT_OK;
    plateMaterial.color.set(color);
    plateEdges.color.set(color);
  };
  const showGhostRef = useRef(showGhost);
  useLayoutEffect(() => {
    showGhostRef.current = showGhost;
  });

  useEffect(() => {
    if (!source) showGhostRef.current(null);
  }, [source]);

  // Turn the selected piece (asked for by the overlay's buttons or the R key).
  const turn = useDecorEdit((state) => state.turnRequest);
  const lastTurn = useRef(turn?.seq ?? 0);
  useEffect(() => {
    if (!turn || turn.seq === lastTurn.current) return;
    lastTurn.current = turn.seq;
    const L = live.current;
    const piece = useDecorEdit.getState().selectedId ? L?.placed.find((candidate) => candidate.id === useDecorEdit.getState().selectedId) : undefined;
    if (!L || !piece || piece.item.placement === 'wall') return;
    const rot = (((piece.spot.rot + turn.delta) % 360) + 360) % 360;
    const rect = decorRect(L.room, piece.item, piece.spot);
    const target: DropTarget = piece.spot.onId
      ? { kind: 'surface', parentId: piece.spot.onId, x: piece.spot.x, z: piece.spot.z }
      : { kind: 'floor', x: rect.x, z: rect.z };
    const drop = resolveDrop(dropContext(L, piece.item, piece.id, rot, false), target);
    if (!drop.ok) {
      toast({ title: 'Can’t turn it here', body: drop.reason ?? 'There isn’t room.', tone: 'neutral' });
      return;
    }
    commit(L, piece.id, drop);
  }, [turn]);

  useEffect(() => {
    if (!room) return undefined;
    const canvas = gl.domElement;
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let press: Press | null = null;
    let lastDrop: Drop | null = null;

    const rayOf = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.ray;
    };
    const held = (): Held | null => {
      const L = live.current;
      const state = useDecorEdit.getState();
      if (!L) return null;
      const id = press?.mode === 'move' ? press.id : state.holdingId;
      if (!id) return null;
      const placedPiece = L.placed.find((piece) => piece.id === id);
      if (placedPiece) return { item: placedPiece.item, variant: placedPiece.variant, id, rot: placedPiece.spot.rot + (press?.mode === 'move' ? 0 : state.holdingRot), autoFace: false };
      const owned = L.own.find((piece) => piece.id === id);
      const item = owned ? findDecorItem(owned.itemId) : undefined;
      const variant = item && owned ? (findDecorVariant(item, owned.variant) ?? item.variants[0]) : undefined;
      return item && variant ? { item, variant, id, rot: state.holdingRot, autoFace: state.holdingRot === 0 } : null;
    };
    const dropAt = (event: PointerEvent): Drop | null => {
      const L = live.current;
      const piece = held();
      if (!L || !piece) return null;
      const ray = rayOf(event);
      const context = dropContext(L, piece.item, piece.id, piece.rot, piece.autoFace);
      let target: DropTarget | null = null;
      if (piece.item.placement === 'wall') {
        const hit = rayWallPoint(ray, L.room);
        target = hit ? { kind: 'wall', wall: hit.wall, u: hit.u, y: hit.y } : null;
      } else if (piece.item.placement === 'tabletop') {
        let nearest = Infinity;
        for (const other of context.others) {
          const otherItem = findDecorItem(other.itemId);
          if (!otherItem || otherItem.surface === undefined || other.pose.onId) continue;
          const point = rayOnSurface(ray, other.pose.y + otherItem.surface, decorRect(L.room, otherItem, other.pose));
          if (!point) continue;
          const distance = Math.hypot(point.x - ray.origin.x, point.z - ray.origin.z);
          if (distance < nearest) {
            nearest = distance;
            target = { kind: 'surface', parentId: other.id, x: point.x, z: point.z };
          }
        }
        if (!target) {
          const floor = rayAtHeight(ray, 0);
          target = floor ? { kind: 'floor', x: floor.x, z: floor.z } : null;
        }
      } else {
        const floor = rayAtHeight(ray, 0);
        target = floor ? { kind: 'floor', x: floor.x, z: floor.z } : null;
      }
      return target ? resolveDrop(context, target) : null;
    };
    const lockCamera = (locked: boolean): void => {
      if (controls) controls.enabled = !locked;
    };
    const end = (): void => {
      if (press?.mode === 'move') useDecorEdit.getState().setDragging(null);
      press = null;
      lastDrop = null;
      lockCamera(false);
      showGhostRef.current(null);
    };

    const onDown = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const L = live.current;
      if (!L) return;
      if (press) {
        // A second finger: the camera's pinch.
        end();
        return;
      }
      const store = useDecorEdit.getState();
      const base = { pointerId: event.pointerId, moved: false, x: event.clientX, y: event.clientY };
      if (store.holdingId) {
        press = { mode: 'place', id: store.holdingId, ...base };
        lockCamera(true);
        lastDrop = dropAt(event);
        showGhostRef.current(lastDrop);
        return;
      }
      const boxes = L.placed.map((piece) => pickBoxOf(L.room, drawableOf(piece)));
      const hit = pickNearest(rayOf(event), boxes);
      if (hit) {
        press = { mode: 'move', id: hit.id, ...base };
        useDecorEdit.getState().select(hit.id);
        lockCamera(true);
        return;
      }
      press = { mode: 'empty', ...base };
    };

    const onMove = (event: PointerEvent): void => {
      if (!press) {
        // Mouse hover while a piece is in hand shows where it would go.
        if (event.pointerType === 'mouse' && useDecorEdit.getState().holdingId) {
          lastDrop = dropAt(event);
          showGhostRef.current(lastDrop);
        }
        return;
      }
      if (event.pointerId !== press.pointerId) return;
      if (!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_SLOP_PX) {
        press.moved = true;
        if (press.mode === 'move') useDecorEdit.getState().setDragging(press.id);
      }
      if (press.mode === 'empty' || (press.mode === 'move' && !press.moved)) return;
      lastDrop = dropAt(event);
      showGhostRef.current(lastDrop);
    };

    const onUp = (event: PointerEvent): void => {
      if (!press || event.pointerId !== press.pointerId) return;
      const L = live.current;
      const finished = press;
      if (finished.mode === 'place') {
        const drop = dropAt(event) ?? lastDrop;
        if (L && drop?.ok) {
          commit(L, finished.id, drop);
          useDecorEdit.getState().select(finished.id);
        } else {
          toast({ title: 'Can’t put it there', body: drop?.reason ?? 'Tap the floor, a wall or a table.', tone: 'neutral' });
        }
      } else if (finished.mode === 'move') {
        if (finished.moved) {
          const drop = dropAt(event) ?? lastDrop;
          if (L && drop?.ok) commit(L, finished.id, drop);
          else toast({ title: 'Can’t move it there', body: drop?.reason ?? 'Drop it on the floor, a wall or a table.', tone: 'neutral' });
        }
      } else if (!finished.moved) {
        useDecorEdit.getState().select(null);
      }
      end();
    };
    const onCancel = (): void => end();

    // Capture phase: take a piece before the camera's orbit controls see the press.
    canvas.addEventListener('pointerdown', onDown, { capture: true });
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    return () => {
      canvas.removeEventListener('pointerdown', onDown, { capture: true });
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      end();
    };
  }, [camera, gl, controls, room]);

  if (!room) return null;
  return (
    <group name="decor-editor">
      <group ref={ghost} visible={false}>
        {ghostGeometry && <mesh geometry={ghostGeometry} material={ghostMaterial} />}
        <group ref={plate}>
          <mesh ref={plateBox} geometry={unitBox} material={plateMaterial} renderOrder={3} />
          <lineSegments geometry={unitEdges} material={plateEdges} renderOrder={4} />
        </group>
      </group>
      <group ref={selection} visible={false}>
        <lineSegments geometry={unitEdges} material={selectEdges} renderOrder={5} />
      </group>
    </group>
  );
}

function dropContext(L: Live, item: DecorItem, excludeId: string, rot: number, autoFace: boolean) {
  const everyone = asPlacedDecor(L.placed);
  // What's on a piece moves with it, so it isn't an obstacle to its own table.
  const others = everyone.filter((other) => other.id !== excludeId && other.pose.onId !== excludeId);
  const cabinRoomId = L.aircraftId ? L.roomId : null;
  // The same rules the server applies: a cabin's, or a home's (a bed goes in a bedroom; the family's furniture stays).
  const check = cabinRoomId
    ? (room: DecorRoom, piece: DecorItem, pose: DecorPose, near: readonly PlacedDecor[]) => checkAircraftDecorPlacement(cabinRoomId, room, piece, pose, near)
    : (room: DecorRoom, piece: DecorItem, pose: DecorPose, near: readonly PlacedDecor[]): PlacementVerdict => {
        if (L.small && !isSmallPiece(piece)) return { ok: false, code: 'WRONG_PLACEMENT', reason: 'The family’s furniture stays where it is — that’s for a place of your own.' };
        const issue = furnitureRoomIssue(L.templateId, L.roomId, piece);
        return issue ? { ok: false, code: 'WRONG_PLACEMENT', reason: issue } : checkDecorPlacement(room, piece, pose, near);
      };
  return { room: L.room, item, others, fixtures: L.fixtures, mounts: L.mounts, rot, autoFace, check };
}

function commit(L: Live, pieceId: string, drop: Drop): void {
  // Remember where it was, so Undo can put it back (a piece from storage goes back to storage).
  const before = L.placed.find((piece) => piece.id === pieceId)?.spot;
  useDecorEdit.getState().remember({
    pieceId,
    was: before ? { templateId: before.templateId, roomId: before.roomId, x: before.x, z: before.z, y: before.y, rot: before.rot, wall: before.wall, onId: before.onId } : null,
    ...(L.aircraftId ? { aircraftId: L.aircraftId } : {}),
  });
  L.place.mutate(
    {
      pieceId,
      ...(L.aircraftId ? { aircraftId: L.aircraftId } : {}),
      request: {
        templateId: L.templateId,
        roomId: L.roomId,
        x: drop.pose.x,
        z: drop.pose.z,
        y: drop.pose.y,
        rot: drop.pose.rot,
        wall: drop.pose.wall,
        onId: drop.pose.onId,
      },
    },
    { onError: (error) => toast({ title: 'Couldn’t place it', body: errorMessage(error), tone: 'bad' }) },
  );
}
