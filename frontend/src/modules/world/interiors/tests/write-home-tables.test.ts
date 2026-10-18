import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'vitest';
import { propFootprint } from '../walk/colliders';
import { HOME_LAYOUTS } from '../layouts/catalog';
import { roomFixtures, roomSlotSpots } from './home-data';

const OUT = resolve(process.cwd(), '../packages/shared/src/catalog');

const fixtureLine = (f: { x: number; z: number; w: number; d: number; h: number }): string => `{ x: ${f.x}, z: ${f.z}, w: ${f.w}, d: ${f.d}, h: ${f.h} }`;

/**
 * Regenerates the tables the server places furniture with, from the 3D templates:
 *   WRITE_HOME_TABLES=1 npx vitest run src/modules/world/interiors/tests/write-home-tables.test.ts
 * Does nothing otherwise (`home-data.test.ts` fails when the committed tables drift). The home rooms for the family house
 * and hostels are printed to the file named by HOME_ROOMS_OUT to paste into `decor-rooms.ts`.
 */
it.skipIf(!process.env.WRITE_HOME_TABLES)('writes the shared home tables', () => {
  const header = `/* Generated from the 3D home templates by frontend/.../interiors/tests/write-home-tables.test.ts (kept in sync by tests/home-data.test.ts). Do not edit by hand. */\n`;
  const fixtureBlock = (provided: boolean): string =>
    Object.entries(HOME_LAYOUTS)
      .map(([templateId, layout]) => {
        const rooms = layout.rooms.map((room) => {
          const list = roomFixtures(room, provided);
          return `    ${room.id}: [${list.length ? '\n' + list.map((f) => `      ${fixtureLine(f)},`).join('\n') + '\n    ' : ''}],`;
        });
        return `  '${templateId}': {\n${rooms.join('\n')}\n  },`;
      })
      .join('\n');
  writeFileSync(
    `${OUT}/decor-fixtures.ts`,
    `${header}import type { DecorFixture } from './decor-rooms.js';\n\ntype FixtureTable = Readonly<Record<string, Readonly<Record<string, readonly DecorFixture[]>>>>;\n\n/** Floor-standing fittings of each room of a home you rent or own (kitchen units, bathroom fittings, stairs). */\nexport const DECOR_HOME_FIXTURES: FixtureTable = {\n${fixtureBlock(false)}\n};\n\n/** The same rooms in the family house and hostels, where all the furniture is the family's / the school's and stays put. */\nexport const DECOR_PROVIDED_FIXTURES: FixtureTable = {\n${fixtureBlock(true)}\n};\n`,
  );
  const slots = Object.entries(HOME_LAYOUTS)
    .map(([templateId, layout]) => {
      const rooms = layout.rooms
        .map((room) => ({ id: room.id, spots: roomSlotSpots(room) }))
        .filter((room) => Object.keys(room.spots).length > 0)
        .map((room) => `    ${room.id}: { ${Object.entries(room.spots).map(([slot, spot]) => `${slot}: [${spot!.join(', ')}]`).join(', ')} },`);
      return rooms.length ? `  '${templateId}': {\n${rooms.join('\n')}\n  },` : '';
    })
    .filter(Boolean)
    .join('\n');
  writeFileSync(
    `${OUT}/furniture-slots.ts`,
    `${header}import type { FurnitureSlot } from './furniture.js';\n\n/** Where the template's own piece of each movable slot stood: [x, z, turn] (moves existing players' furniture across). */\nexport const HOME_SLOT_SPOTS: Readonly<Record<string, Readonly<Record<string, Readonly<Partial<Record<FurnitureSlot, readonly [number, number, number]>>>>>>> = {\n${slots}\n};\n`,
  );
  const rooms = ['home-family', 'home-hostel']
    .map((templateId) => {
      const layout = HOME_LAYOUTS[templateId as keyof typeof HOME_LAYOUTS];
      const lines = layout.rooms.map((room) => {
        const spec = room.template.room;
        const stairs = room.template.props.filter((p) => p.kind === 'stairs' || p.kind === 'stairwell').flatMap((p) => {
          const b = propFootprint(p);
          return b ? [`{ minX: ${+b.minX.toFixed(2)}, maxX: ${+b.maxX.toFixed(2)}, minZ: ${+b.minZ.toFixed(2)}, maxZ: ${+b.maxZ.toFixed(2)} }`] : [];
        });
        const door = (d: { wall: string; at: number; width: number }): string => `{ wall: '${d.wall}', at: ${d.at}, width: ${d.width} }`;
        const win = (w: { wall: string; at: number; width: number; sill?: number; height?: number }): string => `{ wall: '${w.wall}', at: ${w.at}, width: ${w.width}, sill: ${w.sill ?? 0.85}, height: ${w.height ?? 1.05} }`;
        return `    ${room.id}: { label: '${room.label}', width: ${spec.width}, depth: ${spec.depth}, height: ${spec.height}, doors: [${(spec.doors ?? []).map(door).join(', ')}], windows: [${(spec.windows ?? []).map(win).join(', ')}], keepOut: [${stairs.join(', ')}] },`;
      });
      return `  '${templateId}': {\n${lines.join('\n')}\n  },`;
    })
    .join('\n');
  writeFileSync(process.env.HOME_ROOMS_OUT ?? '/dev/null', rooms);
});
