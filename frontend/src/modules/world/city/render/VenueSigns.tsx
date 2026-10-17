'use client';

import { CITY_MAP, cellCentreZ, type CityId, type CityLot } from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color, MeshStandardMaterial, Vector3 } from 'three';
import { atmosphereFrame } from '../lib/atmosphere-frame';
import { addNearFade } from '../materials/city-materials';
import { createAtlasTexture, paintAtlasPage, POST_SLOT, signAtlasPlan, slotUv, type AtlasPage, type SignEntry } from './sign-atlas';
import { setProps } from '../lib/mutate';

/**
 * Venue signboards: facade lightboxes for shops, clinics and offices, roadside pylons for big lots, the name on
 * campus gates, and the toll plaza fascia. Only the city you are in has signs (one atlas of at most 2048 × 2048 per
 * page, see `sign-atlas.ts`): a draw call per page; they glow softly at night.
 */

type Mount = 'facade' | 'pylon' | 'gate';

const FACADE: ReadonlySet<string> = new Set(['shop', 'club', 'hospital', 'office', 'government', 'school']);

class QuadWriter {
  constructor(private readonly pageHeight: number) {}

  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  /** Quad centred at `c`, text reading along `right`, facing `normal`. */
  quad(c: Vector3, right: Vector3, normal: Vector3, width: number, height: number, uv: readonly [number, number, number, number]): void {
    const base = this.positions.length / 3;
    const hw = width / 2;
    const hh = height / 2;
    const corners: readonly (readonly [number, number, number, number])[] = [
      [-hw, -hh, uv[0], uv[1]],
      [hw, -hh, uv[2], uv[1]],
      [hw, hh, uv[2], uv[3]],
      [-hw, hh, uv[0], uv[3]],
    ];
    for (const [x, y, u, v] of corners) {
      this.positions.push(c.x + right.x * x, c.y + y, c.z + right.z * x);
      this.normals.push(normal.x, normal.y, normal.z);
      this.uvs.push(u, v);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Axis-aligned-ish dark box (posts, lightbox backing) using the post swatch. */
  box(c: Vector3, right: Vector3, normal: Vector3, width: number, height: number, depth: number): void {
    const uv = slotUv(this.pageHeight, POST_SLOT);
    const half = (v: Vector3, s: number): Vector3 => v.clone().multiplyScalar(s / 2);
    // Front/back.
    this.quad(c.clone().add(half(normal, depth)), right, normal, width, height, uv);
    this.quad(c.clone().sub(half(normal, depth)), right.clone().negate(), normal.clone().negate(), width, height, uv);
    // Sides.
    this.quad(c.clone().add(half(right, width)), normal.clone().negate(), right, depth, height, uv);
    this.quad(c.clone().sub(half(right, width)), normal, right.clone().negate(), depth, height, uv);
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function mountOf(lot: CityLot): Mount {
  if (lot.archetype === 'campus') return 'gate';
  return FACADE.has(lot.archetype ?? 'shop') ? 'facade' : 'pylon';
}

function writeSign(writer: QuadWriter, entry: SignEntry, lot: CityLot, pageHeight: number): void {
  const entrance = lot.entrance;
  if (!entrance) return;
  const d = new Vector3(Math.cos(entrance.heading), 0, Math.sin(entrance.heading));
  const right = new Vector3(d.z, 0, -d.x);
  const uv = slotUv(pageHeight, entry.slot);
  const door = new Vector3(entrance.position.x, 0, entrance.position.z);
  switch (mountOf(lot)) {
    case 'facade': {
      const centre = door.clone().addScaledVector(d, -0.4).setY(3.7);
      writer.box(centre.clone().addScaledVector(d, -0.12), right, d, 5.4, 1.45, 0.24);
      writer.quad(centre.clone().addScaledVector(d, 0.01), right, d, 5.2, 1.3, uv);
      return;
    }
    case 'gate': {
      writer.quad(door.clone().addScaledVector(d, 0.82).setY(5.05), right, d, 9.6, 1.15, uv);
      return;
    }
    case 'pylon': {
      const base = door.clone().addScaledVector(right, 4.4).addScaledVector(d, -0.1);
      for (const side of [-1, 1]) writer.box(base.clone().addScaledVector(right, side * 2.05).setY(1.4), right, d, 0.18, 2.8, 0.18);
      const board = base.clone().setY(3.35);
      writer.box(board, right, d, 4.8, 1.38, 0.2);
      writer.quad(board.clone().addScaledVector(d, 0.11), right, d, 4.6, 1.2, uv);
      writer.quad(board.clone().addScaledVector(d, -0.11), right.clone().negate(), d.clone().negate(), 4.6, 1.2, uv);
    }
  }
}

function buildSignGeometry(page: AtlasPage): BufferGeometry {
  const writer = new QuadWriter(page.height);
  for (const entry of page.entries) {
    if (entry.lot) writeSign(writer, entry, entry.lot, page.height);
    else {
      // Toll plaza fascia, facing both directions of the expressway.
      const plaza = CITY_MAP.lots.find((lot) => lot.id === 'landmark:lekki-toll-plaza');
      if (!plaza) continue;
      const x = (plaza.footprint.minX + plaza.footprint.maxX) / 2;
      const z = cellCentreZ(plaza.cells[1] - 1);
      const uv = slotUv(page.height, entry.slot);
      writer.quad(new Vector3(x - 6.03, 6.7, z), new Vector3(0, 0, -1), new Vector3(-1, 0, 0), 9, 0.92, uv);
      writer.quad(new Vector3(x + 6.03, 6.7, z), new Vector3(0, 0, 1), new Vector3(1, 0, 0), 9, 0.92, uv);
    }
  }
  return writer.build();
}

/** One atlas page's signs: its texture, material and geometry, built when the city is entered and disposed when it is left. */
function SignPage({ page }: { readonly page: AtlasPage }) {
  const resources = useMemo(() => {
    const { canvas, texture } = createAtlasTexture(page);
    paintAtlasPage(canvas, page);
    const material = new MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: new Color('#ffffff'), emissiveIntensity: 0.1, roughness: 0.55 });
    // Gate boards sit at walking-camera height; dissolve them like the beams they hang on.
    addNearFade(material, 'venue-signs', 1, 3);
    return { canvas, texture, material, geometry: buildSignGeometry(page) };
  }, [page]);

  useEffect(() => {
    let alive = true;
    // Repaint once the brand fonts are ready (first paint uses fallbacks).
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      paintAtlasPage(resources.canvas, page);
      setProps(resources.texture, { needsUpdate: true });
    });
    return () => {
      alive = false;
      resources.texture.dispose();
      resources.material.dispose();
      resources.geometry.dispose();
    };
  }, [resources, page]);

  useFrame(() => {
    setProps(resources.material, { emissiveIntensity: 0.06 + atmosphereFrame.night * 0.75 });
  });

  return <mesh geometry={resources.geometry} material={resources.material} receiveShadow />;
}

/** The signboards of one city (the other city's are never painted, so they take no memory). */
export function VenueSigns({ cityId }: { readonly cityId: CityId }) {
  const pages = signAtlasPlan(cityId);
  return (
    <>
      {pages.map((page) => (
        <SignPage key={`${cityId}:${page.index}`} page={page} />
      ))}
    </>
  );
}
