import type { WorldPlayerPositionDto, WorldVehicleLook } from './realtime.js';
import type { VehicleModel } from '../catalog/vehicles.js';
import { INTEREST_CELL_METRES } from '../world-map/interest.js';

/**
 * Compact wire format of `world:players` (the hottest realtime event: every player around you, ~4 Hz). A batch is one
 * interest cell's positions, flattened so JSON carries almost nothing but digits:
 *   `[batchT, cellX, cellZ, ids, nums, meta?]`
 * - `ids`: one string, 22 base64url characters per row (a uuid is 128 bits). Rows whose id isn't a uuid are dropped.
 * - `nums`: 5 integers per row, in order: `dtAndMode`, `x`, `z`, `heading`, `speed`.
 *   `dtAndMode = round((batchT - t) / 10) * 2 + (car ? 1 : 0)` (10 ms steps); `x`, `z`: decimetres from the cell's
 *   origin (`cellX * INTEREST_CELL_METRES`); `heading`: centiradians in [0, 628]; `speed`: decimetres per second.
 * - `meta` (now and then; see the gateway): `[rowIndex, handle]` or `[rowIndex, handle, model, '#rrggbb']` for a
 *   driver. Clients keep the last meta they heard, so name tags and car looks needn't repeat every 250 ms.
 */
export type WorldPositionMeta = readonly [row: number, handle: string] | readonly [row: number, handle: string, model: string, color: string];
export type WorldPositionBatch =
  | readonly [batchT: number, cellX: number, cellZ: number, ids: string, nums: readonly number[]]
  | readonly [batchT: number, cellX: number, cellZ: number, ids: string, nums: readonly number[], meta: readonly WorldPositionMeta[]];

const CELL_DM = INTEREST_CELL_METRES * 10;
const ROW_NUMS = 5;
const ID_LEN = 22;
const TWO_PI = Math.PI * 2;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT = /^[A-Za-z0-9_-]{22}$/;

/**
 * Short ids already worked out: the gateway encodes every moving player's id four times a second, and a player's id
 * never changes. Bounded (cleared when full), so it stays small whatever the churn.
 */
const SHORT_IDS = new Map<string, string>();
const SHORT_IDS_MAX = 50_000;

/** uuid -> 22 base64url characters (128 bits). Anything that isn't a uuid is returned unchanged. */
export function shortenId(id: string): string {
  const known = SHORT_IDS.get(id);
  if (known !== undefined) return known;
  if (!UUID.test(id)) return id;
  const short = encodeShortId(id);
  if (SHORT_IDS.size >= SHORT_IDS_MAX) SHORT_IDS.clear();
  SHORT_IDS.set(id, short);
  return short;
}

function encodeShortId(id: string): string {
  const hex = id.replace(/-/g, '');
  let out = '';
  // 32 hex digits = 128 bits; 6 bits per character, the last character carries 2 bits (padded with zeros).
  let bits = 0;
  let acc = 0;
  for (let i = 0; i < 32; i++) {
    acc = (acc << 4) | parseInt(hex[i]!, 16);
    bits += 4;
    while (bits >= 6) {
      bits -= 6;
      out += B64[(acc >> bits) & 63];
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += B64[(acc << (6 - bits)) & 63];
  return out;
}

/** Inverse of `shortenId` (values that aren't 22 base64url characters are returned unchanged). */
export function expandId(short: string): string {
  if (!SHORT.test(short)) return short;
  let hex = '';
  let bits = 0;
  let acc = 0;
  for (let i = 0; i < 22 && hex.length < 32; i++) {
    acc = (acc << 6) | B64.indexOf(short[i]!);
    bits += 6;
    while (bits >= 4 && hex.length < 32) {
      bits -= 4;
      hex += ((acc >> bits) & 15).toString(16);
    }
    acc &= (1 << bits) - 1;
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A position to put on the wire, and whether this row carries the handle and car look. */
export interface OutgoingPosition {
  readonly position: WorldPlayerPositionDto;
  readonly withMeta: boolean;
}

export function encodeWorldBatch(items: readonly OutgoingPosition[], batchT: number): WorldPositionBatch {
  const rows = items.filter(({ position }) => UUID.test(position.characterId));
  const first = rows[0]?.position;
  const cellX = first ? Math.floor(first.x / INTEREST_CELL_METRES) : 0;
  const cellZ = first ? Math.floor(first.z / INTEREST_CELL_METRES) : 0;
  let ids = '';
  const nums: number[] = [];
  const meta: WorldPositionMeta[] = [];
  rows.forEach(({ position: p, withMeta }, index) => {
    ids += shortenId(p.characterId);
    const dt = Math.max(0, Math.min(500, Math.round((batchT - p.t) / 10)));
    const heading = ((p.heading % TWO_PI) + TWO_PI) % TWO_PI;
    nums.push(dt * 2 + (p.mode === 'car' ? 1 : 0), Math.round(p.x * 10) - cellX * CELL_DM, Math.round(p.z * 10) - cellZ * CELL_DM, Math.round(heading * 100), Math.round(p.speed * 10));
    if (withMeta) meta.push(p.vehicle ? [index, p.handle, p.vehicle.model, p.vehicle.color] : [index, p.handle]);
  });
  return meta.length > 0 ? [batchT, cellX, cellZ, ids, nums, meta] : [batchT, cellX, cellZ, ids, nums];
}

/** Malformed input is tolerated (the payload came over the network): bad rows are skipped. */
export function decodeWorldBatch(batch: WorldPositionBatch): WorldPlayerPositionDto[] {
  const out: WorldPlayerPositionDto[] = [];
  if (!Array.isArray(batch)) return out;
  const [batchT, cellX, cellZ, ids, nums, metaList] = batch;
  if (![batchT, cellX, cellZ].every(Number.isFinite) || typeof ids !== 'string' || !Array.isArray(nums)) return out;
  const metaByRow = new Map<number, WorldPositionMeta>();
  if (Array.isArray(metaList)) for (const meta of metaList) if (Array.isArray(meta) && typeof meta[0] === 'number') metaByRow.set(meta[0], meta as unknown as WorldPositionMeta);
  const count = Math.min(Math.floor(ids.length / ID_LEN), Math.floor(nums.length / ROW_NUMS));
  for (let i = 0; i < count; i++) {
    const [dtAndMode, dx, dz, heading, speed] = nums.slice(i * ROW_NUMS, i * ROW_NUMS + ROW_NUMS) as [number, number, number, number, number];
    if (![dtAndMode, dx, dz, heading, speed].every(Number.isFinite)) continue;
    const car = (dtAndMode & 1) === 1;
    const meta = metaByRow.get(i);
    const vehicle: WorldVehicleLook | undefined = car && meta?.[2] ? { model: meta[2] as VehicleModel, color: meta[3] ?? '#888888' } : undefined;
    out.push({
      characterId: expandId(ids.slice(i * ID_LEN, (i + 1) * ID_LEN)),
      handle: typeof meta?.[1] === 'string' ? meta[1] : '',
      x: (cellX * CELL_DM + dx) / 10,
      z: (cellZ * CELL_DM + dz) / 10,
      heading: heading / 100,
      mode: car ? 'car' : 'walk',
      speed: speed / 10,
      ...(vehicle ? { vehicle } : {}),
      t: batchT - Math.floor(dtAndMode / 2) * 10,
    });
  }
  return out;
}
