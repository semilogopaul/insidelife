'use client';

import { useEffect, useMemo } from 'react';
import {
  CanvasTexture,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { OwnedLot } from '../layout/owned-lots';
import { createCityMaterial } from '../materials/city-materials';
import { buildOwnedGeometry, type OwnedSign } from './owned-geometry';

/** Your land, building sites and houses (see `owned-geometry`), with their signs painted on. */

interface SignLook {
  readonly background: string;
  readonly ink: readonly string[];
  readonly pixelsPerMetre: number;
}

const LOOKS: Readonly<Record<OwnedSign['kind'], SignLook>> = {
  // Hand-painted board: red lettering on white, the owner's name in black.
  land: { background: '#f7f5ef', ink: ['#c0392b', '#c0392b', '#1b1b1b', '#1b1b1b'], pixelsPerMetre: 280 },
  site: { background: '#1f5f8b', ink: ['#f6b90b', '#ffffff', '#ffffff', '#cfe3f0'], pixelsPerMetre: 280 },
  plate: { background: '#1b1b1b', ink: ['#e0c36a'], pixelsPerMetre: 420 },
  // Painted straight onto the wall.
  wall: { background: 'rgba(0,0,0,0)', ink: ['#b3261e'], pixelsPerMetre: 260 },
};

function signTexture(sign: OwnedSign): CanvasTexture {
  const look = LOOKS[sign.kind];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sign.width * look.pixelsPerMetre);
  canvas.height = Math.round(sign.height * look.pixelsPerMetre);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const css = getComputedStyle(document.documentElement);
    const display = `${css.getPropertyValue('--font-anybody').trim() || "'Arial Narrow'"}, Arial, sans-serif`;
    ctx.fillStyle = look.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const lines = sign.lines;
    const lineHeight = canvas.height / (lines.length + 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, index) => {
      const size = Math.min(lineHeight * 0.78, (canvas.width * 0.92) / Math.max(4, line.length * 0.56));
      ctx.font = `${sign.kind === 'land' && index >= 2 ? 700 : 900} ${Math.round(size)}px ${display}`;
      ctx.fillStyle = look.ink[index] ?? look.ink[0] ?? '#000';
      ctx.fillText(line, canvas.width / 2, lineHeight * (index + 0.8), canvas.width * 0.94);
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface SignMesh {
  readonly key: string;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly scale: Vector3;
  readonly material: MeshStandardMaterial;
  readonly texture: CanvasTexture;
}

export function OwnedProperties({
  owned,
  owner,
  shadows,
}: {
  readonly owned: readonly OwnedLot[];
  readonly owner: { readonly firstName: string; readonly lastName: string };
  readonly shadows: boolean;
}) {
  const { firstName, lastName } = owner;
  const built = useMemo(
    () => buildOwnedGeometry(owned, { firstName, lastName }),
    [owned, firstName, lastName],
  );
  const material = useMemo(() => createCityMaterial('props', null), []);
  const plane = useMemo(() => new PlaneGeometry(1, 1), []);
  const signs = useMemo<readonly SignMesh[]>(
    () =>
      built.signs.map((sign) => {
        const texture = signTexture(sign);
        const look = LOOKS[sign.kind];
        const signMaterial = new MeshStandardMaterial({
          map: texture,
          roughness: 0.75,
          transparent: look.background.startsWith('rgba'),
          polygonOffset: true,
          polygonOffsetFactor: -2,
        });
        // Explicit position/rotation/scale: R3F doesn't apply a `matrix` prop.
        const pose = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() };
        new Matrix4()
          .makeTranslation(sign.x, sign.y, sign.z)
          .premultiply(sign.matrix)
          .multiply(new Matrix4().makeScale(sign.width, sign.height, 1))
          .decompose(pose.position, pose.quaternion, pose.scale);
        return { key: sign.key, ...pose, material: signMaterial, texture };
      }),
    [built],
  );

  useEffect(() => () => built.geometry?.dispose(), [built]);
  useEffect(
    () => () => {
      for (const sign of signs) {
        sign.material.dispose();
        sign.texture.dispose();
      }
    },
    [signs],
  );
  useEffect(
    () => () => {
      material.dispose();
      plane.dispose();
    },
    [material, plane],
  );

  return (
    <>
      {built.geometry && (
        <mesh
          geometry={built.geometry}
          material={material}
          castShadow={shadows}
          receiveShadow
          name="owned-properties"
        />
      )}
      {signs.map((sign) => (
        <mesh
          key={sign.key}
          geometry={plane}
          material={sign.material}
          position={sign.position}
          quaternion={sign.quaternion}
          scale={sign.scale}
        />
      ))}
    </>
  );
}
