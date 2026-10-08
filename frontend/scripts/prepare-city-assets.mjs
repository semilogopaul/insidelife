#!/usr/bin/env node
/**
 * Prepares the open-world city and vehicle assets from the Kenney CC0 kits.
 *
 *   node scripts/prepare-city-assets.mjs [--source <dir with the unzipped kits>]
 *
 * - City kits (commercial, suburban, roads, nature) are bundled into ONE GLB per kit: each model becomes a root node
 *   named after it, re-centred so its footprint centre is at the origin and its base at y = 0. Buildings also get a
 *   meshopt-simplified `<name>__lod` sibling for distant chunks.
 * - Vehicles are copied one GLB per model (node names such as `wheel-front-left` are kept for the play layer), plus a
 *   yellow `danfo` derived from the van by re-pointing its paint UVs to the yellow swatch of the kit's colormap.
 * - Everything is deduped, pruned, welded, quantized and meshopt-compressed (loaders must register MeshoptDecoder).
 * - Writes `src/modules/world/city/assets/kit-manifest.ts` (sizes + triangle counts) for the pure layout code.
 */
import { Document, Logger, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '..');
const DEFAULT_SOURCE = '/private/tmp/claude-501/-Users-MAC-Downloads-insidelife/7da25df4-b365-421f-8e36-fa83f352c119/scratchpad/assets-raw';
const argSource = process.argv.indexOf('--source');
const SOURCE = path.resolve(argSource > 0 ? process.argv[argSource + 1] : (process.env.KENNEY_SOURCE ?? DEFAULT_SOURCE));
const PUBLIC = path.join(FRONTEND, 'public/assets');
const MANIFEST = path.join(FRONTEND, 'src/modules/world/city/assets/kit-manifest.ts');

const letters = (prefix, from, to) => {
  const out = [];
  for (let c = from.charCodeAt(0); c <= to.charCodeAt(0); c++) out.push(`${prefix}${String.fromCharCode(c)}`);
  return out;
};

/** Parked traffic for the city: one bundle with a simplified `__lod` per car (the play layer loads full cars itself). */
const PARKED = ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'taxi', 'van', 'delivery', 'truck', 'police', 'ambulance', 'danfo'];

const KITS = {
  commercial: {
    dir: 'city-kit-commercial/Models/GLB format',
    out: 'city/commercial/commercial.glb',
    models: [...letters('building-', 'a', 'n'), ...letters('building-skyscraper-', 'a', 'e'), 'detail-awning', 'detail-awning-wide', 'detail-overhang', 'detail-overhang-wide', 'detail-parasol-a', 'detail-parasol-b'],
    lod: (name) => name.startsWith('building-'),
  },
  suburban: {
    dir: 'city-kit-suburban/Models/GLB format',
    out: 'city/suburban/suburban.glb',
    models: [...letters('building-type-', 'a', 'u'), 'fence-1x3', 'fence-low', 'planter', 'tree-large', 'tree-small'],
    lod: (name) => name.startsWith('building-type-'),
  },
  roads: {
    dir: 'city-kit-roads/Models/GLB format',
    out: 'city/roads/roads.glb',
    models: [
      'road-straight',
      'road-straight-barrier',
      'road-bend',
      'road-intersection',
      'road-crossroad',
      'road-crossroad-path',
      'road-crossing',
      'road-end-round',
      'road-roundabout',
      'bridge-pillar-wide',
      'light-curved',
      'light-curved-double',
      'light-square-double',
      'electricity-pole',
      'traffic-light',
      'sign-highway-wide',
      'construction-cone',
      'construction-barrier',
      'dumpster',
      'road-sign-street',
    ],
    lod: (name) => !name.startsWith('road-'),
    lodRatio: 0.3,
  },
  parked: {
    dir: 'car-kit/Models/GLB format',
    out: 'city/vehicles/parked.glb',
    models: PARKED,
    derived: [{ name: 'danfo', from: 'van', remapU: [[0.969, 0.531]], vRange: [0.25, 0.5] }],
    lod: () => true,
    lodRatio: 0.22,
    /** Parked cars never spin their wheels: Kenney wheels are 360 tris each, keep a third of them. */
    simplifyFull: (nodeName) => nodeName.startsWith('wheel'),
  },
  nature: {
    dir: 'nature-kit/Models/GLTF format',
    out: 'city/nature/nature.glb',
    models: [
      'tree_palm',
      'tree_palmTall',
      'tree_palmBend',
      'tree_palmShort',
      'tree_palmDetailedTall',
      'tree_default',
      'tree_oak',
      'tree_detailed',
      'tree_fat',
      'tree_plateau',
      'plant_bush',
      'plant_bushLarge',
      'plant_bushDetailed',
      'grass_large',
      'grass',
      'flower_redA',
      'flower_yellowA',
      'flower_purpleA',
      'rock_largeA',
      'rock_smallA',
      'canoe',
    ],
    lod: () => true,
    lodRatio: 0.4,
  },
};

const VEHICLES = {
  dir: 'car-kit/Models/GLB format',
  models: ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'taxi', 'van', 'delivery', 'truck', 'police', 'ambulance', 'wheel-default', 'wheel-dark', 'wheel-truck', 'wheel-racing'],
  /** Danfo = the van repainted Danfo yellow: van paint swatch (u≈0.969) → yellow swatch (u≈0.531) of the car colormap. */
  derived: [{ name: 'danfo', from: 'van', remapU: [[0.969, 0.531]], vRange: [0.25, 0.5] }],
};

const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR)).registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const triangles = (root) => {
  let count = 0;
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) count += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
  return Math.round(count);
};

const subtreeTriangles = (node) => {
  let count = 0;
  node.traverse((child) => {
    const mesh = child.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) count += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
  });
  return Math.round(count);
};

const round = (value) => Math.round(value * 1000) / 1000;

/**
 * Distant-chunk LOD: meshopt simplification in permissive mode (Kenney meshes are flat-shaded with UV seams
 * everywhere, so the regular simplifier cannot collapse anything), then compaction to the vertices still used.
 */
function simplifiedCopy(doc, prim, ratio, error) {
  const positions = new Float32Array(prim.getAttribute('POSITION').getArray());
  const indices = new Uint32Array(prim.getIndices().getArray());
  const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3);
  // Weight UVs so collapses never drag a face onto another palette swatch (wrong colours at distance).
  const uvAttribute = prim.getAttribute('TEXCOORD_0');
  const [lod] = uvAttribute
    ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, new Float32Array(uvAttribute.getArray()), 2, [6, 6], null, target, error, ['Permissive', 'Prune'])
    : MeshoptSimplifier.simplify(indices, positions, 3, target, error, ['Permissive', 'Prune']);
  const remap = new Map();
  const order = [];
  const compactIndices = new Uint32Array(lod.length);
  for (let i = 0; i < lod.length; i++) {
    let next = remap.get(lod[i]);
    if (next === undefined) {
      next = order.length;
      remap.set(lod[i], next);
      order.push(lod[i]);
    }
    compactIndices[i] = next;
  }
  const copy = doc.createPrimitive().setMode(prim.getMode()).setMaterial(prim.getMaterial());
  for (const semantic of prim.listSemantics()) {
    const source = prim.getAttribute(semantic);
    const size = source.getElementSize();
    const ArrayType = source.getArray().constructor;
    const data = new ArrayType(order.length * size);
    const el = [];
    order.forEach((vertex, i) => {
      source.getElement(vertex, el);
      for (let k = 0; k < size; k++) data[i * size + k] = el[k];
    });
    copy.setAttribute(semantic, doc.createAccessor().setType(source.getType()).setArray(data).setNormalized(source.getNormalized()));
  }
  copy.setIndices(doc.createAccessor().setType('SCALAR').setArray(order.length > 65535 ? compactIndices : new Uint16Array(compactIndices)));
  return copy;
}

/** Re-points the van's paint UVs to the yellow swatch (danfo). */
function repaint(doc, remap) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!uv) continue;
      const copy = uv.clone();
      prim.setAttribute('TEXCOORD_0', copy);
      const el = [];
      for (let i = 0; i < copy.getCount(); i++) {
        copy.getElement(i, el);
        for (const [fromU, toU] of remap.remapU) {
          if (Math.abs(el[0] - fromU) < 0.02 && el[1] >= remap.vRange[0] && el[1] <= remap.vRange[1]) copy.setElement(i, [toU, el[1]]);
        }
      }
    }
  }
}

async function readModel(kit, name) {
  const derived = kit.derived?.find((entry) => entry.name === name);
  const source = await io.read(path.join(SOURCE, kit.dir, `${derived ? derived.from : name}.glb`));
  if (derived) repaint(source, derived);
  return source;
}

async function buildKit(key, kit) {
  const target = new Document().setLogger(new Logger(Logger.Verbosity.ERROR));
  target.createBuffer();
  const scene = target.createScene('kit');
  const manifest = {};
  for (const name of kit.models) {
    const source = await readModel(kit, name);
    const sourceScene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0];
    const bounds = getBounds(sourceScene);
    const map = mergeDocuments(target, source);
    const merged = map.get(sourceScene);
    const cx = (bounds.min[0] + bounds.max[0]) / 2;
    const cz = (bounds.min[2] + bounds.max[2]) / 2;
    const wrapper = target.createNode(name).setTranslation([-cx, -bounds.min[1], -cz]);
    for (const child of merged.listChildren()) wrapper.addChild(child);
    merged.dispose();
    scene.addChild(wrapper);
    const entry = {
      size: [round(bounds.max[0] - bounds.min[0]), round(bounds.max[1] - bounds.min[1]), round(bounds.max[2] - bounds.min[2])],
      triangles: subtreeTriangles(wrapper),
    };

    if (kit.simplifyFull) {
      const done = new Set();
      wrapper.traverse((node) => {
        const mesh = node.getMesh();
        if (!mesh || done.has(mesh) || !kit.simplifyFull(node.getName())) return;
        done.add(mesh);
        for (const prim of mesh.listPrimitives()) {
          mesh.addPrimitive(simplifiedCopy(target, prim, 0.25, 0.08));
          mesh.removePrimitive(prim);
        }
      });
      entry.triangles = subtreeTriangles(wrapper);
    }

    if (kit.lod(name)) {
      const lodWrapper = target.createNode(`${name}__lod`).setTranslation(wrapper.getTranslation());
      const [tx, ty, tz] = wrapper.getTranslation();
      wrapper.traverse((node) => {
        const mesh = node.getMesh();
        if (!mesh) return;
        const lodMesh = target.createMesh(`${mesh.getName()}__lod`);
        for (const prim of mesh.listPrimitives()) lodMesh.addPrimitive(simplifiedCopy(target, prim, kit.lodRatio ?? 0.2, 0.035));
        // Matrix relative to the wrapper (the wrapper is a pure translation).
        const matrix = [...node.getWorldMatrix()];
        matrix[12] -= tx;
        matrix[13] -= ty;
        matrix[14] -= tz;
        lodWrapper.addChild(target.createNode(`${node.getName()}__lod`).setMesh(lodMesh).setMatrix(matrix));
      });
      scene.addChild(lodWrapper);
      entry.lodTriangles = subtreeTriangles(lodWrapper);
    }
    manifest[name] = entry;
  }
  target.getRoot().setDefaultScene(scene);
  for (const extra of target.getRoot().listScenes()) if (extra !== scene) extra.dispose();
  // Merged documents each bring a buffer; one is enough for a GLB.
  const [buffer, ...rest] = target.getRoot().listBuffers();
  for (const accessor of target.getRoot().listAccessors()) accessor.setBuffer(buffer);
  for (const extra of rest) extra.dispose();

  await target.transform(dedup(), prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(PUBLIC, kit.out);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await io.write(out, target);
  const { size } = await fs.stat(out);
  console.log(`${key.padEnd(11)} ${String(kit.models.length).padStart(3)} models  ${String(triangles(target.getRoot())).padStart(7)} tris  ${(size / 1024).toFixed(0).padStart(5)} KB  → ${path.relative(FRONTEND, out)}`);
  return { file: `/assets/${kit.out}`, bytes: size, models: manifest };
}

async function buildVehicle(name, sourceName, remap) {
  const doc = await io.read(path.join(SOURCE, VEHICLES.dir, `${sourceName}.glb`));
  if (remap) repaint(doc, remap);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const bounds = getBounds(scene);
  await doc.transform(dedup(), prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(PUBLIC, 'vehicles', `${name}.glb`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  const { size } = await fs.stat(out);
  return {
    file: `/assets/vehicles/${name}.glb`,
    bytes: size,
    size: [round(bounds.max[0] - bounds.min[0]), round(bounds.max[1] - bounds.min[1]), round(bounds.max[2] - bounds.min[2])],
    triangles: triangles(doc.getRoot()),
  };
}

async function copyLicenses() {
  const credits = path.join(PUBLIC, 'CREDITS.md');
  const block = [
    '## Kenney — City Kit (Commercial, Suburban, Roads), Car Kit, Nature Kit',
    '',
    '- Author: Kenney (www.kenney.nl) — License: Creative Commons Zero (CC0 1.0)',
    '- Used for: the open-world city (`assets/city/**`) and vehicles (`assets/vehicles/**`).',
    '- Optimised with glTF-Transform (dedup, prune, weld, meshopt). The `danfo` vehicle is the Car Kit van repainted.',
    '- Thank you Kenney! Support at https://kenney.nl/support',
    '',
  ].join('\n');
  let current = '';
  try {
    current = await fs.readFile(credits, 'utf8');
  } catch {
    current = '# Asset credits\n\nThird-party assets bundled with Inside Life.\n\n';
  }
  if (!current.includes('City Kit (Commercial, Suburban, Roads)')) await fs.writeFile(credits, `${current.trimEnd()}\n\n${block}`);
}

async function main() {
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
  await fs.access(SOURCE).catch(() => {
    throw new Error(`Kenney source folder not found: ${SOURCE} (pass --source <dir> or set KENNEY_SOURCE)`);
  });
  const kits = {};
  for (const [key, kit] of Object.entries(KITS)) kits[key] = await buildKit(key, kit);
  const vehicles = {};
  for (const name of VEHICLES.models) vehicles[name] = await buildVehicle(name, name, null);
  for (const derived of VEHICLES.derived) vehicles[derived.name] = await buildVehicle(derived.name, derived.from, derived);
  const vehicleBytes = Object.values(vehicles).reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`vehicles    ${String(Object.keys(vehicles).length).padStart(3)} files                  ${(vehicleBytes / 1024).toFixed(0).padStart(5)} KB  → public/assets/vehicles/`);
  const total = Object.values(kits).reduce((sum, entry) => sum + entry.bytes, 0) + vehicleBytes;
  console.log(`total       ${(total / 1024 / 1024).toFixed(2)} MB`);

  const source = `/* Generated by scripts/prepare-city-assets.mjs — do not edit. Sizes are Kenney units (1 unit ≈ one road tile). */\n\nexport const KIT_MANIFEST = ${JSON.stringify(kits, null, 2)} as const;\n\nexport const VEHICLE_MANIFEST = ${JSON.stringify(vehicles, null, 2)} as const;\n`;
  await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
  await fs.writeFile(MANIFEST, source);
  await copyLicenses();
  console.log(`manifest → ${path.relative(FRONTEND, MANIFEST)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
