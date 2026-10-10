'use client';

import { AD_PLACEMENT_KINDS, AD_PLACEMENTS, AD_SLOTS, adWeekPriceLabel, type AdPlacementKind, type AdPlacementSpot, type BillboardFormat } from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, PlaneGeometry, type BufferGeometry, type CanvasTexture, type Texture } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { atmosphereFrame } from '../lib/atmosphere-frame';
import { highlightGlow } from './AdHighlight';
import { setProps } from '../lib/mutate';
import { addNearFade, createCityMaterial } from '../materials/city-materials';
import { paint } from '../render/paint';
import { currentBillboard } from './billboard-content';
import { boardTexture, drawHouseAd } from './Billboards';
import { useLiveBillboards } from './use-billboards';

/**
 * The ~540 generated ad spots (`AD_PLACEMENTS`): street billboards, bus shelters, lightbox totems, stadium LEDs, market
 * banners and motor-park boards. Draw calls stay flat however many there are: every structure is one merged mesh,
 * every empty face shows a shared "Your ad here" texture through one InstancedMesh per format and kind (with the kind's
 * current "from" weekly price), and only spots with a paid creative running get their own face (hidden
 * beyond LIVE_RANGE). Faces are tagged for the play layer's taps:
 * live faces carry `userData.billboardSlotId`, instanced faces `userData.billboardSlotIds[instanceId]`.
 */

const STEEL = 0x3b3f44;
const PANEL = 0x26282b;
const GLASS = 0x9fb6bf;
const CONCRETE = 0x9a9a94;
const LIVE_RANGE = 150;

/** Where each face sits in the spot's local frame (+z faces the viewer): front, and back for two-sided spots. */
const FACE_DEPTH: Readonly<Record<AdPlacementKind, readonly number[]>> = {
  'street-billboard': [0.02],
  'bus-shelter': [0.02, -0.16],
  totem: [0.1, -0.1],
  'stadium-led': [0.02],
  'market-banner': [0.03, -0.03],
  'park-board': [0.02],
};

const frameOf = (spot: AdPlacementSpot): Matrix4 => {
  const dx = Math.cos(spot.facing);
  const dz = Math.sin(spot.facing);
  return new Matrix4().makeRotationY(Math.atan2(dx, dz)).setPosition(spot.position.x, 0, spot.position.z);
};

function structureGeometry(spots: readonly AdPlacementSpot[]): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const spot of spots) {
    const m = frameOf(spot);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number): void => {
      parts.push(paint(new BoxGeometry(w, h, d).translate(x, y + h / 2, z), hex).applyMatrix4(m));
    };
    const { width: w, height: h, elevation: e } = spot;
    switch (spot.kind) {
      case 'street-billboard':
        box(w + 0.3, h + 0.3, 0.2, 0, e - 0.15, -0.12, PANEL);
        box(0.36, e, 0.36, 0, 0, -0.4, STEEL);
        box(w * 0.6, 0.18, 0.18, 0, e - 0.35, -0.3, STEEL);
        break;
      case 'bus-shelter':
        // End panel (the advert) and an open shelter running behind it along the pavement.
        box(w + 0.14, h + 0.14, 0.14, 0, e - 0.07, -0.07, PANEL);
        for (const x of [-0.72, 0.72]) for (const z of [0, -2.8]) box(0.08, 2.45, 0.08, x, 0, z - 0.1, STEEL);
        box(1.7, 0.1, 3.1, 0, 2.45, -1.45, GLASS);
        box(1.25, 0.08, 1.7, 0, 0.45, -1.55, STEEL);
        box(1.3, 0.06, 0.06, 0, 0.9, -2.85, STEEL);
        break;
      case 'totem':
        box(0.55, 0.2, 0.36, 0, 0, 0, CONCRETE);
        box(0.16, e, 0.16, 0, 0, 0, STEEL);
        box(w + 0.14, h + 0.14, 0.18, 0, e - 0.07, 0, PANEL);
        break;
      case 'stadium-led':
        box(w + 0.2, h + 0.2, 0.36, 0, e - 0.1, -0.19, PANEL);
        for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) box(0.16, e, 0.16, x, 0, -0.2, STEEL);
        break;
      case 'market-banner':
        for (const x of [-(w / 2 + 0.12), w / 2 + 0.12]) box(0.12, e + h + 0.25, 0.12, x, 0, 0, STEEL);
        box(w + 0.36, 0.08, 0.08, 0, e + h + 0.05, 0, STEEL);
        break;
      case 'park-board':
        for (const x of [-(w / 2 + 0.35), w / 2 + 0.35]) box(0.3, e + h + 0.35, 0.3, x, 0, -0.1, STEEL);
        box(w + 1, 0.3, 0.3, 0, e + h + 0.1, -0.1, STEEL);
        box(w + 0.2, h + 0.2, 0.16, 0, e - 0.1, -0.1, PANEL);
        break;
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged ?? new BoxGeometry(0, 0, 0);
}

interface FaceRef {
  readonly spot: AdPlacementSpot;
  readonly depth: number;
}

interface FacePose {
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  readonly scale: readonly [number, number, number];
}

/** Pose of a face: centred on the advert, `depth` in front of the frame, turned round for back faces. */
function facePose({ spot, depth }: FaceRef): FacePose {
  const dx = Math.cos(spot.facing);
  const dz = Math.sin(spot.facing);
  return {
    position: [spot.position.x + dx * depth, spot.elevation + spot.height / 2, spot.position.z + dz * depth],
    yaw: Math.atan2(dx, dz) + (depth < 0 ? Math.PI : 0),
    scale: [spot.width, spot.height, 1],
  };
}

const helper = new Object3D();

function faceMatrix(face: FaceRef, target: Matrix4): Matrix4 {
  const pose = facePose(face);
  helper.position.set(...pose.position);
  helper.rotation.set(0, pose.yaw, 0);
  helper.scale.set(...pose.scale);
  helper.updateMatrix();
  return target.copy(helper.matrix);
}

/** Catalog default for each kind's empty faces ("From ₦3,500/week"); the live feed sends the current rates. */
const DEFAULT_KIND_LABEL: Readonly<Record<AdPlacementKind, string>> = Object.fromEntries(
  AD_PLACEMENT_KINDS.map((kind) => {
    const prices = AD_SLOTS.filter((slot) => slot.kind === kind).map((slot) => slot.weekPriceKobo);
    return [kind, prices.length > 0 ? `From ${adWeekPriceLabel(Math.min(...prices))}` : ''];
  }),
) as Record<AdPlacementKind, string>;

/** Empty faces share one texture per format and kind, so each kind shows its own "from" price. */
const houseGroupOf = (spot: AdPlacementSpot): string => `${spot.format}|${spot.kind}`;

function houseMaterial(format: BillboardFormat, priceLabel: string): { readonly material: MeshStandardMaterial; readonly texture: CanvasTexture } {
  const size = format === 'landscape' ? { width: 3, height: 1 } : format === 'portrait' ? { width: 2, height: 3 } : { width: 1, height: 1 };
  const texture = drawHouseAd(size, { headline: 'Your ad here', body: 'Open Promote on your phone', priceLabel });
  const material = new MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: new Color('#ffffff'), emissiveIntensity: 0.15, roughness: 0.6 });
  addNearFade(material, 'street-ad-faces', 1, 3);
  return { material, texture };
}

function liveFaceMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ emissive: new Color('#ffffff'), emissiveIntensity: 0.15, roughness: 0.6 });
  addNearFade(material, 'street-ad-faces', 1, 3);
  return material;
}

interface LiveFace extends FaceRef {
  readonly material: MeshStandardMaterial;
}

export function StreetAds({ shadows }: { readonly shadows: boolean }) {
  const { data: live } = useLiveBillboards();
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const structure = useMemo(() => ({ geometry: structureGeometry(AD_PLACEMENTS), material: createCityMaterial('props', null) }), []);

  // Current "from" prices per kind (ops can change rates); the textures are only redrawn when a label changes.
  const labels = AD_PLACEMENT_KINDS.map((kind) => live?.priceLabels?.[kind] ?? DEFAULT_KIND_LABEL[kind]).join('\n');
  const house = useMemo(() => {
    const labelOf = new Map(AD_PLACEMENT_KINDS.map((kind, index) => [kind, labels.split('\n')[index] ?? DEFAULT_KIND_LABEL[kind]]));
    const plane = new PlaneGeometry(1, 1);
    const groups = [...new Set(AD_PLACEMENTS.map(houseGroupOf))];
    const meshes = groups.map((group) => {
      const spots = AD_PLACEMENTS.filter((spot) => houseGroupOf(spot) === group);
      const format = spots[0]?.format ?? 'landscape';
      const faces = spots.flatMap((spot) => FACE_DEPTH[spot.kind].map((depth): FaceRef => ({ spot, depth })));
      const { material, texture } = houseMaterial(format, spots[0] ? (labelOf.get(spots[0].kind) ?? '') : '');
      const mesh = new InstancedMesh(plane, material, Math.max(1, faces.length));
      mesh.count = faces.length;
      const matrix = new Matrix4();
      faces.forEach((face, index) => mesh.setMatrixAt(index, faceMatrix(face, matrix)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `street-ads:${group}`;
      mesh.userData.billboardSlotIds = faces.map((face) => face.spot.id);
      return { mesh, material, texture, group };
    });
    return { plane, meshes, byGroup: new Map<string, Texture>(meshes.map((entry) => [entry.group, entry.texture])) };
  }, [labels]);

  // Spots with a paid creative running get their own face (front and back), swapping texture with the rotation.
  const liveFaces = useMemo<readonly LiveFace[]>(() => {
    const ids = new Set((live?.slots ?? []).filter((slot) => slot.creatives.length > 0).map((slot) => slot.slotId));
    return AD_PLACEMENTS.filter((spot) => ids.has(spot.id)).flatMap((spot) =>
      FACE_DEPTH[spot.kind].map((depth) => ({
        spot,
        depth: depth + Math.sign(depth || 1) * 0.01,
        material: liveFaceMaterial(),
      })),
    );
  }, [live]);
  const livePoses = useMemo(() => liveFaces.map(facePose), [liveFaces]);
  const creatives = useRef(new Map<string, Texture | 'loading' | 'failed'>());
  const liveMeshes = useRef<(Object3D | null)[]>([]);

  useEffect(
    () => () => {
      for (const face of liveFaces) face.material.dispose();
    },
    [liveFaces],
  );
  useEffect(() => {
    const textures = creatives.current;
    return () => {
      structure.geometry.dispose();
      structure.material.dispose();
      house.plane.dispose();
      for (const entry of house.meshes) {
        entry.material.dispose();
        entry.texture.dispose();
        entry.mesh.dispose();
      }
      for (const texture of textures.values()) if (typeof texture !== 'string') texture.dispose();
      textures.clear();
    };
  }, [structure, house]);

  const elapsed = useRef(1);
  useFrame(({ camera, clock }, delta) => {
    const glow = 0.12 + atmosphereFrame.night * 0.85;
    for (const entry of house.meshes) setProps(entry.material, { emissiveIntensity: glow });
    // A live face in focus ("See it in Lagos") glows; empty faces are instances and rely on AdHighlight's frame.
    for (const face of liveFaces) {
      const boost = highlightGlow(face.spot.id, clock.elapsedTime);
      if (boost > 0 || face.material.emissiveIntensity > glow) setProps(face.material, { emissiveIntensity: glow + boost });
    }
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    elapsed.current = 0;
    const now = Date.now();
    liveFaces.forEach((face, index) => {
      const object = liveMeshes.current[index];
      const near = Math.hypot(camera.position.x - face.spot.position.x, camera.position.z - face.spot.position.z) < LIVE_RANGE;
      if (object) object.visible = near;
      if (!near) return;
      const content = currentBillboard(face.spot.id, liveRef.current, now);
      const fallback = house.byGroup.get(houseGroupOf(face.spot)) ?? (house.meshes[0]?.texture as Texture);
      const map = boardTexture(content, fallback, creatives.current);
      if (face.material.map !== map) setProps(face.material, { map, emissiveMap: map, needsUpdate: true });
      setProps(face.material, { emissiveIntensity: glow });
    });
  });

  return (
    <>
      <mesh geometry={structure.geometry} material={structure.material} castShadow={shadows} receiveShadow />
      {house.meshes.map((entry) => (
        <primitive key={entry.group} object={entry.mesh} />
      ))}
      {liveFaces.map((face, index) => (
        <mesh
          key={`${face.spot.id}:${face.depth}`}
          ref={(node) => {
            liveMeshes.current[index] = node;
          }}
          position={livePoses[index]?.position}
          rotation-y={livePoses[index]?.yaw ?? 0}
          scale={livePoses[index]?.scale}
          geometry={house.plane}
          material={face.material}
          userData={{ billboardSlotId: face.spot.id }}
          name={`street-ad:${face.spot.id}`}
        />
      ))}
    </>
  );
}
