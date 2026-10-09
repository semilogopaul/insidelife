import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Response, Test } from 'supertest';
import { MINUTES_PER_YEAR, type CharacterSnapshotDto, type RegisterResponseDto } from '@insidelife/shared';
import type { E2eApp } from './app.js';
import { E2E } from './env.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

let ipCounter = 0;
let nameCounter = 0;

/**
 * A distinct client address per simulated player (sent as X-Forwarded-For; the app trusts one proxy hop, like behind
 * nginx). Rate limits are per IP and per route, so each player gets the production limits for themselves and a test
 * never trips over another's quota. Production limits are untouched.
 */
export function nextIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

/** A unique, valid @handle (3-20 of a-z0-9_). */
export function uniqueHandle(prefix = 'p'): string {
  nameCounter += 1;
  return `${prefix}${nameCounter}_${randomUUID().slice(0, 6)}`.toLowerCase().slice(0, 20);
}

export const API = '/api/v1';

/** A request to the API as an anonymous client from `ip`. */
export function call(e2e: E2eApp, method: Method, path: string, ip: string = nextIp()): Test {
  const server = e2e.app.getHttpServer();
  return request(server)[method](path.startsWith('/api') ? path : `${API}${path}`).set('X-Forwarded-For', ip);
}

export class Player {
  token: string;
  characterId = '';
  handle = '';

  constructor(
    readonly e2e: E2eApp,
    readonly userId: string,
    readonly email: string,
    readonly password: string,
    token: string,
    readonly ip: string,
    /** The refresh cookie (`il_rt=…`) from sign-up / sign-in. */
    public refreshCookie: string | null,
  ) {
    this.token = token;
  }

  request(method: Method, path: string): Test {
    return call(this.e2e, method, path, this.ip).set('Authorization', `Bearer ${this.token}`);
  }

  get(path: string): Test {
    return this.request('get', path);
  }

  post(path: string, body?: object): Test {
    const test = this.request('post', path);
    return body === undefined ? test : test.send(body);
  }

  put(path: string, body?: object): Test {
    const test = this.request('put', path);
    return body === undefined ? test : test.send(body);
  }

  patch(path: string, body?: object): Test {
    const test = this.request('patch', path);
    return body === undefined ? test : test.send(body);
  }

  delete(path: string): Test {
    return this.request('delete', path);
  }

  async snapshot(): Promise<CharacterSnapshotDto> {
    return ok<CharacterSnapshotDto>(await this.get('/characters/me'));
  }

  /** Cash balance straight from the ledger (not from any API response). */
  async cash(): Promise<number> {
    return balanceOf(this.e2e, this.characterId, 'cash');
  }

  async savings(): Promise<number> {
    return balanceOf(this.e2e, this.characterId, 'savings');
  }

  async character(): Promise<CharacterRow> {
    const rows = await this.e2e.dataSource.query<CharacterRow[]>(
      `SELECT id, handle, location_id, earned_total::bigint AS earned_total, unearned_total::bigint AS unearned_total,
              locked_unearned::bigint AS locked_unearned, purchased_total::bigint AS purchased_total, mood_modifiers,
              needs, status, hidden_at, background, activity, born_at::bigint AS born_at
         FROM characters WHERE id = $1`,
      [this.characterId],
    );
    const row = rows[0];
    if (!row) throw new RangeError(`No character ${this.characterId}`);
    return {
      ...row,
      earned_total: Number(row.earned_total),
      unearned_total: Number(row.unearned_total),
      locked_unearned: Number(row.locked_unearned),
      purchased_total: Number(row.purchased_total),
      born_at: Number(row.born_at),
    };
  }
}

export interface CharacterRow {
  readonly id: string;
  readonly handle: string;
  readonly location_id: string;
  readonly earned_total: number;
  readonly unearned_total: number;
  readonly locked_unearned: number;
  readonly purchased_total: number;
  readonly mood_modifiers: ReadonlyArray<{ readonly id: string; readonly label: string; readonly value: number; readonly until: number }>;
  readonly needs: Readonly<Record<string, number>>;
  readonly status: number;
  readonly hidden_at: Date | null;
  readonly background: string;
  readonly activity: { readonly actionId: string; readonly cost: number } | null;
  readonly born_at: number;
}

export async function balanceOf(e2e: E2eApp, characterId: string, kind: 'cash' | 'savings' | 'pension' | 'usd'): Promise<number> {
  const rows = await e2e.dataSource.query<Array<{ balance: string }>>(`SELECT balance FROM ledger_accounts WHERE owner_id = $1 AND kind = $2`, [characterId, kind]);
  return Number(rows[0]?.balance ?? Number.NaN);
}

/** "POST /api/v1/…" of the request behind a response (supertest keeps it on `req`). */
const requestLine = (response: Response): string => {
  const req = (response as unknown as { req?: { method?: string; path?: string } }).req;
  return `${req?.method ?? ''} ${req?.path ?? ''}`;
};

/** Assert a 2xx and return the body. Failing responses print their body, which is what you want to read. */
export function ok<T>(response: Response): T {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Expected 2xx from ${requestLine(response)}, got ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body as T;
}

/** Assert a refusal with this status (and error code, when given). */
export function refused(response: Response, status: number, errorCode?: string): void {
  if (response.status !== status || (errorCode !== undefined && (response.body as { errorCode?: string }).errorCode !== errorCode)) {
    throw new Error(`Expected ${status}${errorCode ? ` ${errorCode}` : ''} from ${requestLine(response)}, got ${response.status}: ${JSON.stringify(response.body)}`);
  }
}

const refreshCookieOf = (response: Response): string | null => {
  const header = response.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : typeof header === 'string' ? [header] : [];
  const cookie = cookies.find((value) => value.startsWith('il_rt='));
  return cookie ? (cookie.split(';')[0] ?? null) : null;
};

export interface SignUpOptions {
  readonly email?: string;
  readonly password?: string;
}

/** Register an account through the API (no character yet). */
export async function signUp(e2e: E2eApp, options: SignUpOptions = {}): Promise<Player> {
  const email = options.email ?? `${uniqueHandle('u')}@e2e.test`;
  const password = options.password ?? E2E.password;
  const ip = nextIp();
  const response = await call(e2e, 'post', '/auth/register', ip).send({ email, password, birthDate: '1996-04-12' });
  const body = ok<RegisterResponseDto>(response);
  return new Player(e2e, body.user.id, email, password, body.accessToken, ip, refreshCookieOf(response));
}

export interface PlayerOptions extends SignUpOptions {
  readonly handle?: string;
  /** Age the character to this many game years (characters start at 17; clubs and alcohol are 18+). */
  readonly age?: number;
}

/** Register and create a character through the API. */
export async function createPlayer(e2e: E2eApp, options: PlayerOptions = {}): Promise<Player> {
  const player = await signUp(e2e, options);
  const handle = options.handle ?? uniqueHandle();
  const snapshot = ok<CharacterSnapshotDto>(
    await player.post('/characters', {
      firstName: 'Ada',
      lastName: 'Okafor',
      handle,
      gender: 'female',
      stateOfOrigin: 'lagos',
      appearance: { bodyType: 'average', height: 1, skinTone: 3, hairStyle: 'lowcut', hairColor: 0, facialHair: 'none', eyeStyle: 'round' },
    }),
  );
  player.characterId = snapshot.character.id;
  player.handle = snapshot.character.handle;
  if (options.age !== undefined) await setAge(player, options.age);
  return player;
}

/** Sign in again (new access token; returns the response for status checks). */
export async function signIn(player: Player): Promise<Response> {
  const response = await call(player.e2e, 'post', '/auth/login', player.ip).send({ email: player.email, password: player.password });
  if (response.status === 200) {
    player.token = (response.body as { accessToken: string }).accessToken;
    player.refreshCookie = refreshCookieOf(response) ?? player.refreshCookie;
  }
  return response;
}

export async function refresh(player: Player): Promise<Response> {
  const test = call(player.e2e, 'post', '/auth/refresh', player.ip);
  if (player.refreshCookie) test.set('Cookie', player.refreshCookie);
  const response = await test;
  if (response.status === 200) player.refreshCookie = refreshCookieOf(response) ?? player.refreshCookie;
  return response;
}

// ----- Test setup straight in the database (play itself always goes through the API) ------------------------------

/** Put the character inside a place (as if they walked in), idle. */
export async function moveTo(player: Player, locationId: string): Promise<void> {
  await player.e2e.dataSource.query(`UPDATE characters SET location_id = $1, region_id = 'lagos', travel = NULL, activity = NULL WHERE id = $2`, [locationId, player.characterId]);
}

export async function goHome(player: Player): Promise<void> {
  await moveTo(player, `home:${player.characterId}`);
}

export async function setAge(player: Player, years: number): Promise<void> {
  const bornAt = player.e2e.clock.now - years * MINUTES_PER_YEAR - 10;
  await player.e2e.dataSource.query(`UPDATE characters SET born_at = $1 WHERE id = $2`, [bornAt, player.characterId]);
}

/** Make the character this many real hours old (transfer tiers count game days since creation). */
export async function setCreatedHoursAgo(player: Player, hours: number): Promise<void> {
  await player.e2e.dataSource.query(`UPDATE characters SET created_at = now() - make_interval(hours => $1) WHERE id = $2`, [hours, player.characterId]);
}

export async function verifyEmail(player: Player): Promise<void> {
  await player.e2e.dataSource.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [player.userId]);
}

export const key = (): string => randomUUID();
