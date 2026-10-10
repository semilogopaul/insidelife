import type { Test } from 'supertest';
import { currentTotp } from '../../src/modules/admin/auth/totp.js';
import type { E2eApp } from './app.js';
import { E2E } from './env.js';
import { call, nextIp, ok, Player, signUp, verifyEmail } from './players.js';

interface ChallengeBody {
  readonly stage: 'setup' | 'verify';
  readonly challengeToken: string;
  readonly setup: { readonly secret: string } | null;
}

/** A signed-in admin portal session (owner or admin): password, then an authenticator code, like the portal. */
export class Admin {
  constructor(
    readonly e2e: E2eApp,
    readonly account: Player,
    readonly token: string,
    readonly ip: string,
  ) {}

  /** Admin requests carry the portal's Origin (the admin API refuses other origins on writes). */
  request(method: 'get' | 'post' | 'put' | 'delete', path: string, body?: object): Test {
    const test = call(this.e2e, method, `/admin${path}`, this.ip).set('Authorization', `Bearer ${this.token}`).set('Origin', E2E.adminOrigin);
    return body === undefined ? test : test.send(body);
  }

  get(path: string): Test {
    return this.request('get', path);
  }

  post(path: string, body?: object): Test {
    return this.request('post', path, body ?? {});
  }

  put(path: string, body?: object): Test {
    return this.request('put', path, body ?? {});
  }
}

/** Sign an existing account in to the admin portal, setting up its authenticator on first use. */
export async function adminSignIn(e2e: E2eApp, account: Player): Promise<Admin> {
  const ip = nextIp();
  const challenge = ok<ChallengeBody>(
    await call(e2e, 'post', '/admin/auth/sign-in', ip).set('Origin', E2E.adminOrigin).send({ email: account.email, password: account.password }),
  );
  if (challenge.stage !== 'setup' || !challenge.setup) throw new RangeError('Expected a first sign-in (authenticator set-up)');
  const code = await currentTotp(challenge.setup.secret);
  const session = ok<{ accessToken: string }>(
    await call(e2e, 'post', '/admin/auth/mfa/setup', ip).set('Origin', E2E.adminOrigin).send({ challengeToken: challenge.challengeToken, code }),
  );
  return new Admin(e2e, account, session.accessToken, ip);
}

/**
 * An account for the portal: registered now, or (spec files share one database) the one an earlier file registered,
 * signed in with the known password and with its authenticator reset so this file can set it up again.
 */
async function portalAccount(e2e: E2eApp, email: string): Promise<Player> {
  const existing = await e2e.dataSource.query<Array<{ id: string }>>(`SELECT id FROM users WHERE email = $1`, [email]);
  const userId = existing[0]?.id;
  if (!userId) {
    const account = await signUp(e2e, { email });
    await verifyEmail(account);
    return account;
  }
  await e2e.dataSource.query(`DELETE FROM admin_mfa WHERE user_id = $1`, [userId]);
  const ip = nextIp();
  const session = ok<{ accessToken: string }>(await call(e2e, 'post', '/auth/login', ip).send({ email, password: E2E.password }));
  return new Player(e2e, userId, email, E2E.password, session.accessToken, ip, null);
}

/** The owner (ADMIN_EMAILS), signed in to the portal. */
export async function signInOwner(e2e: E2eApp): Promise<Admin> {
  return adminSignIn(e2e, await portalAccount(e2e, E2E.ownerEmail));
}

/** A second account granted the `admin` role by the owner (not an owner), signed in. */
export async function grantAdmin(e2e: E2eApp, owner: Admin, email: string): Promise<Admin> {
  const account = await portalAccount(e2e, email);
  const [row] = await e2e.dataSource.query<Array<{ role: string }>>(`SELECT role FROM users WHERE id = $1`, [account.userId]);
  if (row?.role !== 'admin') ok(await owner.post('/admins', { email, reason: 'E2E moderator for the suite' }));
  return adminSignIn(e2e, account);
}
