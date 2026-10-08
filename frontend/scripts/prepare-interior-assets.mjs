#!/usr/bin/env node
/**
 * Prepares the interior (dollhouse) assets from the Kenney CC0 kits.
 *
 *   node scripts/prepare-interior-assets.mjs [--source <dir with the unzipped kits>]
 *
 * - Furniture (furniture-kit) and a few plants (nature-kit) are bundled into ONE GLB: every model becomes a root node
 *   named after it, re-centred so its footprint centre is at the origin and its base at y = 0. Materials are flat
 *   colours named by role (wood, carpet, metal…); the runtime bakes them into vertex colours and recolours by name.
 * - Three showroom cars (car-kit, colormap texture) go into a second GLB.
 * - Everything is deduped, pruned, welded and meshopt-compressed (loaders must register MeshoptDecoder).
 * - Writes `src/modules/world/interiors/kit/kit-manifest.ts` (native sizes + triangle counts) for the layout code.
 */
import { Document, Logger, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '..');
const DEFAULT_SOURCE = '/private/tmp/claude-501/-Users-MAC-Downloads-insidelife/7da25df4-b365-421f-8e36-fa83f352c119/scratchpad/assets-raw';
const argSource = process.argv.indexOf('--source');
const SOURCE = path.resolve(argSource > 0 ? process.argv[argSource + 1] : (process.env.KENNEY_SOURCE ?? DEFAULT_SOURCE));
const OUT_DIR = path.join(FRONTEND, 'public/assets/interiors');
const MANIFEST = path.join(FRONTEND, 'src/modules/world/interiors/kit/kit-manifest.ts');

const FURNITURE = [
  // Sleeping & sitting
  'bedSingle', 'bedDouble', 'bedBunk', 'chair', 'chairCushion', 'chairDesk', 'chairRounded', 'chairModernCushion', 'bench', 'benchCushion',
  'loungeSofa', 'loungeSofaLong', 'loungeSofaCorner', 'loungeChair', 'loungeChairRelax', 'loungeDesignSofa', 'loungeDesignChair', 'loungeSofaOttoman', 'stoolBar', 'stoolBarSquare',
  // Tables & storage
  'table', 'tableCloth', 'tableCoffee', 'tableCoffeeGlass', 'tableRound', 'tableCross', 'tableGlass', 'desk', 'deskCorner', 'sideTable', 'sideTableDrawers',
  'cabinetBed', 'cabinetBedDrawer', 'cabinetTelevision', 'cabinetTelevisionDoors', 'bookcaseOpen', 'bookcaseClosed', 'bookcaseClosedDoors', 'bookcaseClosedWide', 'bookcaseOpenLow', 'books', 'coatRackStanding', 'cardboardBoxClosed', 'cardboardBoxOpen', 'trashcan', 'tableCoffeeGlassSquare', 'tableCoffeeSquare', 'tableCrossCloth',
  // Electronics
  'televisionModern', 'televisionVintage', 'computerScreen', 'computerKeyboard', 'computerMouse', 'laptop', 'speaker', 'speakerSmall', 'radio',
  // Kitchen & bathroom
  'kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenCabinetUpper', 'kitchenCabinetUpperDouble', 'kitchenSink', 'kitchenStove', 'kitchenFridge', 'kitchenFridgeLarge', 'kitchenFridgeSmall', 'kitchenMicrowave', 'kitchenBar', 'kitchenBarEnd', 'kitchenBlender', 'kitchenCoffeeMachine', 'toaster',
  'toilet', 'bathroomSink', 'bathroomMirror', 'bathtub', 'shower', 'washer',
  // Lights, soft furnishing, decor
  'lampRoundFloor', 'lampSquareFloor', 'lampRoundTable', 'lampSquareTable', 'lampWall', 'lampSquareCeiling', 'ceilingFan', 'pottedPlant', 'plantSmall1', 'plantSmall2', 'plantSmall3',
  'rugRectangle', 'rugRound', 'rugRounded', 'rugSquare', 'rugDoormat', 'pillow', 'pillowLong', 'pillowBlue', 'bear', 'doorway', 'doorwayFront', 'doorwayOpen',
];

const NATURE = ['tree_palmDetailedTall', 'tree_palmShort', 'tree_palmBend', 'plant_bushLarge', 'plant_bushDetailed', 'pot_large', 'pot_small', 'flower_redA', 'flower_yellowA', 'grass_large'];

const CARS = ['sedan', 'suv-luxury', 'hatchback-sports'];

const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR)).registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const round = (value) => Math.round(value * 1000) / 1000;

const subtreeTriangles = (node) => {
  let count = 0;
  node.traverse((child) => {
    const mesh = child.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) count += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
  });
  return Math.round(count);
};

async function bundle(entries, outFile) {
  const target = new Document().setLogger(new Logger(Logger.Verbosity.ERROR));
  target.createBuffer();
  const scene = target.createScene('kit');
  const manifest = {};
  for (const { name, file } of entries) {
    const source = await io.read(file);
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
    manifest[name] = {
      size: [round(bounds.max[0] - bounds.min[0]), round(bounds.max[1] - bounds.min[1]), round(bounds.max[2] - bounds.min[2])],
      triangles: subtreeTriangles(wrapper),
    };
  }
  for (const extra of target.getRoot().listScenes()) if (extra !== scene) extra.dispose();
  target.getRoot().setDefaultScene(scene);
  // Merge buffers into one.
  const [buffer, ...rest] = target.getRoot().listBuffers();
  for (const accessor of target.getRoot().listAccessors()) accessor.setBuffer(buffer);
  for (const extra of rest) extra.dispose();
  await target.transform(dedup(), prune({ keepLeaves: true }), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await io.write(outFile, target);
  const { size } = await fs.stat(outFile);
  return { manifest, bytes: size };
}

function formatManifest(manifest) {
  const rows = Object.entries(manifest).map(([name, entry]) => `  ${JSON.stringify(name)}: { size: [${entry.size.join(', ')}], triangles: ${entry.triangles} },`);
  return `{\n${rows.join('\n')}\n}`;
}

async function main() {
  const furnitureDir = path.join(SOURCE, 'furniture-kit/Models/GLTF format');
  const natureDir = path.join(SOURCE, 'nature-kit/Models/GLTF format');
  const carDir = path.join(SOURCE, 'car-kit/Models/GLB format');
  const kit = await bundle(
    [...FURNITURE.map((name) => ({ name, file: path.join(furnitureDir, `${name}.glb`) })), ...NATURE.map((name) => ({ name, file: path.join(natureDir, `${name}.glb`) }))],
    path.join(OUT_DIR, 'furniture.glb'),
  );
  const cars = await bundle(
    CARS.map((name) => ({ name, file: path.join(carDir, `${name}.glb`) })),
    path.join(OUT_DIR, 'showroom-cars.glb'),
  );
  const lines = [
    '/* Generated by scripts/prepare-interior-assets.mjs — do not edit by hand. */',
    '',
    '/** Native (unscaled) size [x, y, z] in metres and triangle count of every model in the interior kits. */',
    `export const FURNITURE_MANIFEST = ${formatManifest(kit.manifest)} as const;`,
    '',
    `export const CAR_MANIFEST = ${formatManifest(cars.manifest)} as const;`,
    '',
    'export type KitModel = keyof typeof FURNITURE_MANIFEST;',
    'export type ShowroomCar = keyof typeof CAR_MANIFEST;',
    '',
  ];
  await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
  await fs.writeFile(MANIFEST, lines.join('\n'));
  console.log(`furniture.glb ${(kit.bytes / 1024).toFixed(1)} KB (${Object.keys(kit.manifest).length} models)`);
  console.log(`showroom-cars.glb ${(cars.bytes / 1024).toFixed(1)} KB (${Object.keys(cars.manifest).length} models)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
