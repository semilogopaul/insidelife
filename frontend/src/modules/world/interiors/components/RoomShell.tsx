'use client';

import { useEffect, useMemo } from 'react';
import { type BufferGeometry, type MeshStandardMaterial, type Texture } from 'three';
import { createSurfaceMaterial } from '@/common/three/materials/surface-material';
import { shadeHex } from '@/common/three/materials/color-utils';
import { buildProps } from '../props/build-props';
import type { PropSpec } from '../props/prop-types';
import { buildSignAtlas } from '../props/signs';
import { buildFloor, buildGlass, buildRoomTrims, buildWalls } from '../room/build-room';
import { paintFloor, paintWall } from '../room/room-textures';
import type { InteriorTemplate } from '../templates/types';

interface ShellResources {
  readonly floor: BufferGeometry;
  readonly floorMaterial: MeshStandardMaterial;
  readonly walls: BufferGeometry | null;
  readonly wallMaterial: MeshStandardMaterial | null;
  readonly glass: BufferGeometry | null;
  readonly glassMaterial: MeshStandardMaterial | null;
  readonly props: BufferGeometry | null;
  readonly propMaterial: MeshStandardMaterial;
  readonly signs: BufferGeometry | null;
  readonly signMaterial: MeshStandardMaterial | null;
  readonly textures: readonly Texture[];
}

function buildShell(template: InteriorTemplate): ShellResources {
  const { room } = template;
  const floorTexture = paintFloor(room.floor, room.floorColor);
  const floorMaterial = createSurfaceMaterial({ map: floorTexture, roughness: room.floor === 'marble' || room.floor === 'tiles' ? 0.55 : 1 });
  const textures: Texture[] = [floorTexture];
  let wallMaterial: MeshStandardMaterial | null = null;
  const walls = buildWalls(room);
  if (walls) {
    const wallTexture = paintWall(room.wall, room.height);
    textures.push(wallTexture);
    wallMaterial = createSurfaceMaterial({ map: wallTexture });
  }
  const glass = buildGlass(room);
  const glassMaterial = glass ? createSurfaceMaterial({ color: '#1d2a33', emissive: '#cfe7ff', emissiveIntensity: 1, roughness: 0.2 }) : null;
  const signSpecs = template.props.filter((prop): prop is Extract<PropSpec, { kind: 'sign' }> => prop.kind === 'sign');
  const atlas = buildSignAtlas(signSpecs);
  if (atlas) textures.push(atlas.texture);
  const frame = room.wall.style === 'panel' ? '#2b2f33' : '#f4f1ea';
  const props = buildProps(template.props, (kit) => buildRoomTrims(kit, room, { frame, door: '#8a5a36', skirting: shadeHex(room.wall.band ?? room.wall.color, -0.35) }));
  return {
    floor: buildFloor(room),
    floorMaterial,
    walls,
    wallMaterial,
    glass,
    glassMaterial,
    props,
    propMaterial: createSurfaceMaterial(),
    signs: atlas?.geometry ?? null,
    signMaterial: atlas ? createSurfaceMaterial({ map: atlas.texture }) : null,
    textures,
  };
}

function disposeShell(shell: ShellResources): void {
  shell.floor.dispose();
  shell.floorMaterial.dispose();
  shell.walls?.dispose();
  shell.wallMaterial?.dispose();
  shell.glass?.dispose();
  shell.glassMaterial?.dispose();
  shell.props?.dispose();
  shell.propMaterial.dispose();
  shell.signs?.dispose();
  shell.signMaterial?.dispose();
  for (const texture of shell.textures) texture.dispose();
}

/**
 * The room itself: floor, cutaway walls with windows and doors, trims, procedural props and signage — five draw
 * calls whatever the template. Calls `onGlass` with the window material so lighting can tint it by time of day.
 */
export function RoomShell({ template, onGlass }: { readonly template: InteriorTemplate; readonly onGlass: (material: MeshStandardMaterial | null) => void }) {
  const shell = useMemo(() => buildShell(template), [template]);
  useEffect(() => {
    onGlass(shell.glassMaterial);
    return () => disposeShell(shell);
  }, [shell, onGlass]);
  return (
    <group name="room-shell">
      <mesh geometry={shell.floor} material={shell.floorMaterial} />
      {shell.walls && shell.wallMaterial && <mesh geometry={shell.walls} material={shell.wallMaterial} />}
      {shell.glass && shell.glassMaterial && <mesh geometry={shell.glass} material={shell.glassMaterial} />}
      {shell.props && <mesh geometry={shell.props} material={shell.propMaterial} />}
      {shell.signs && shell.signMaterial && <mesh geometry={shell.signs} material={shell.signMaterial} />}
    </group>
  );
}
