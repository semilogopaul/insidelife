import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { findVehicle, formatNaira, yearsBetween } from '@insidelife/shared';
import { ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import { toCsv, type CsvColumn } from '../../../common/utils/csv.js';
import { EXPORT_ROW_LIMIT, SqlWhere, containsPattern, offsetOf, pageOf, type Page, type PageRequest } from '../../../common/utils/paging.js';
import type { AppConfig } from '../../../config/configuration.js';
import { AccountLifecycleService } from '../../accounts/account-lifecycle.service.js';
import { accountStatus, canRestore } from '../../accounts/account-status.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuditActor } from '../../audit/audit.types.js';
import { characterLabel } from '../../characters/character-directory.service.js';
import { LedgerTransactionEntity } from '../../ledger/entities/ledger-transaction.entity.js';
import { CharacterSession } from '../../simulation/character-session.service.js';
import { WorldService } from '../../world/world.service.js';
import type {
  AdminLedgerEntryDto,
  AdminPlayerDetailDto,
  AdminPlayerRowDto,
  WalletAdjustmentResultDto,
} from '../interfaces/admin-players.interfaces.js';
import type { PlayerSort, PlayersQueryDto, WalletAdjustmentDto } from './dto/players.dto.js';

interface PlayerRow {
  readonly user_id: string;
  readonly email: string;
  readonly email_verified_at: Date | null;
  readonly role: 'player' | 'admin' | 'owner';
  readonly created_at: Date;
  readonly last_login_at: Date | null;
  readonly suspended_at: Date | null;
  readonly deleted_at: Date | null;
  readonly purge_after: Date | null;
  readonly purged_at: Date | null;
  readonly character_id: string | null;
  readonly handle: string | null;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly alive: boolean | null;
  readonly net_worth: string | null;
  readonly last_active_at: Date | null;
  readonly hidden_at: Date | null;
  readonly cash: string | null;
}

const SORT_COLUMNS: Readonly<Record<PlayerSort, string>> = {
  createdAt: 'u.created_at',
  lastActiveAt: 'COALESCE(c.last_active_at, u.last_login_at)',
  lastLoginAt: 'u.last_login_at',
  email: 'u.email',
  handle: 'c.handle',
  netWorth: 'c.net_worth',
  cash: 'cash.balance',
};

/** The account's representative character (living first, else the latest) and its cash. */
const PLAYER_FROM = `
  FROM users u
  LEFT JOIN LATERAL (
    SELECT ch.id, ch.handle, ch.first_name, ch.last_name, ch.alive, ch.net_worth, ch.last_active_at, ch.hidden_at
      FROM characters ch WHERE ch.user_id = u.id
     ORDER BY ch.alive DESC, ch.created_at DESC LIMIT 1) c ON true
  LEFT JOIN ledger_accounts cash ON cash.owner_id = c.id AND cash.kind = 'cash'`;

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

const PLAYER_CSV: readonly CsvColumn<AdminPlayerRowDto>[] = [
  { header: 'User id', value: (row) => row.userId },
  { header: 'Email', value: (row) => row.email },
  { header: 'Email verified', value: (row) => (row.emailVerified ? 'yes' : 'no') },
  { header: 'Role', value: (row) => row.role },
  { header: 'Status', value: (row) => row.status },
  { header: 'Handle', value: (row) => (row.character ? `@${row.character.handle}` : null) },
  { header: 'Name', value: (row) => (row.character ? `${row.character.firstName} ${row.character.lastName}` : null) },
  { header: 'Alive', value: (row) => (row.character ? (row.character.alive ? 'yes' : 'no') : null) },
  { header: 'Cash (NGN)', value: (row) => row.cash },
  { header: 'Net worth (NGN)', value: (row) => row.character?.netWorth ?? null },
  { header: 'Signed up', value: (row) => row.createdAt },
  { header: 'Last sign-in', value: (row) => row.lastLoginAt },
  { header: 'Last active', value: (row) => row.lastActiveAt },
  { header: 'Suspended at', value: (row) => row.suspendedAt },
  { header: 'Deleted at', value: (row) => row.deletedAt },
  { header: 'Restorable until', value: (row) => row.restorableUntil },
];

/**
 * Players for the admin portal: a read model over users, characters and wallets (search, filters, sort, CSV), the
 * detail page, and the actions (suspend, delete/restore through `AccountLifecycleService`; wallet adjustments and
 * handle resets through `CharacterSession`, so money only moves through the ledger and the character row is locked).
 */
@Injectable()
export class AdminPlayersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly lifecycle: AccountLifecycleService,
    private readonly session: CharacterSession,
    private readonly audit: AuditService,
    private readonly world: WorldService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async list(query: PlayersQueryDto, request: PageRequest): Promise<Page<AdminPlayerRowDto>> {
    const where = this.where(query);
    const order = query.order === 'asc' ? 'ASC' : 'DESC';
    const sort = SORT_COLUMNS[query.sort ?? 'createdAt'];
    const roleParam = where.param(this.owners());
    const [rows, count] = await Promise.all([
      this.dataSource.query<PlayerRow[]>(
        `SELECT ${this.columns(roleParam)} ${PLAYER_FROM} ${where.toSql()}
          ORDER BY ${sort} ${order} NULLS LAST, u.id ${order}
          LIMIT ${request.pageSize} OFFSET ${offsetOf(request)}`,
        where.params,
      ),
      this.dataSource.query<Array<{ total: string }>>(`SELECT count(*) AS total ${PLAYER_FROM} ${where.toSql()}`, where.params.slice(0, -1)),
    ]);
    return pageOf(rows.map((row) => this.toRow(row)), Number(count[0]?.total ?? 0), request);
  }

  async exportCsv(query: PlayersQueryDto): Promise<{ readonly csv: string; readonly rows: number }> {
    const where = this.where(query);
    const roleParam = where.param(this.owners());
    const rows = await this.dataSource.query<PlayerRow[]>(
      `SELECT ${this.columns(roleParam)} ${PLAYER_FROM} ${where.toSql()}
        ORDER BY ${SORT_COLUMNS[query.sort ?? 'createdAt']} ${query.order === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, u.id
        LIMIT ${EXPORT_ROW_LIMIT}`,
      where.params,
    );
    return { csv: toCsv(PLAYER_CSV, rows.map((row) => this.toRow(row))), rows: rows.length };
  }

  async detail(userId: string): Promise<AdminPlayerDetailDto> {
    const owners = this.owners();
    const rows = await this.dataSource.query<Array<PlayerRow & { birth_date: string | null; suspension_reason: string | null; suspended_by_email: string | null; deleted_by: string | null; deleted_by_email: string | null }>>(
      `SELECT ${this.columns('$2')}, u.birth_date::text AS birth_date, u.suspension_reason,
              sb.email AS suspended_by_email, u.deleted_by, db.email AS deleted_by_email
         ${PLAYER_FROM}
         LEFT JOIN users sb ON sb.id = u.suspended_by
         LEFT JOIN users db ON db.id = u.deleted_by
        WHERE u.id = $1`,
      [userId, owners],
    );
    const row = rows[0];
    if (!row) throw new ResourceNotFoundException('Player');
    const base = this.toRow(row);

    const characterId = row.character_id;
    const [character, wallet, ledger, properties, vehicles, reports, payments, audit] = await Promise.all([
      characterId ? this.characterDetail(characterId) : Promise.resolve(null),
      characterId ? this.wallet(characterId) : Promise.resolve(null),
      this.ledger(userId, { page: 1, pageSize: 20 }),
      characterId ? this.properties(characterId) : Promise.resolve([]),
      characterId ? this.vehicles(characterId) : Promise.resolve([]),
      this.reports(userId),
      this.payments(userId),
      this.audit.list({ targetType: 'player', targetId: userId }, { page: 1, pageSize: 20 }),
    ]);
    return {
      account: {
        ...base,
        birthDate: row.birth_date,
        suspensionReason: row.suspension_reason,
        suspendedBy: row.suspended_by_email,
        deletedBy: row.deleted_by_email,
        deletedBySelf: row.deleted_at !== null && row.deleted_by === null,
        canRestore: canRestore({ deletedAt: row.deleted_at, purgeAfter: row.purge_after, purgedAt: row.purged_at }, new Date()),
        purgedAt: iso(row.purged_at),
      },
      character,
      wallet,
      ledger,
      properties,
      vehicles,
      reports,
      payments,
      audit: audit.items,
    };
  }

  /** Every account of the player's characters (cash, savings, pension, usd), newest first. */
  async ledger(userId: string, request: PageRequest): Promise<Page<AdminLedgerEntryDto>> {
    const from = `FROM ledger_entries e
                  JOIN ledger_accounts a ON a.id = e.account_id
                  JOIN characters ch ON ch.id = a.owner_id
                  JOIN ledger_transactions t ON t.id = e.transaction_id
             LEFT JOIN characters cp ON cp.id = CASE WHEN t.counterparty_character_id = ch.id THEN t.character_id ELSE t.counterparty_character_id END
                 WHERE ch.user_id = $1`;
    const [rows, count] = await Promise.all([
      this.dataSource.query<Array<{ id: string; transaction_id: string; kind_account: string; kind: string; memo: string; amount: string; balance_after: string | null; counterparty: string | null; created_at: Date }>>(
        `SELECT e.id, e.transaction_id, a.kind AS kind_account, t.kind, t.memo, e.amount, e.balance_after, cp.handle AS counterparty, e.created_at
           ${from}
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT ${request.pageSize} OFFSET ${offsetOf(request)}`,
        [userId],
      ),
      this.dataSource.query<Array<{ total: string }>>(`SELECT count(*) AS total ${from}`, [userId]),
    ]);
    return pageOf(
      rows.map((entry) => ({
        id: entry.id,
        transactionId: entry.transaction_id,
        account: entry.kind_account,
        kind: entry.kind,
        memo: entry.memo,
        amount: Number(entry.amount),
        balanceAfter: entry.balance_after === null ? null : Number(entry.balance_after),
        counterparty: entry.counterparty,
        createdAt: entry.created_at.toISOString(),
      })),
      Number(count[0]?.total ?? 0),
      request,
    );
  }

  suspend(actor: AuditActor, userId: string, reason: string): Promise<unknown> {
    return this.lifecycle.suspend(actor, userId, reason);
  }

  unsuspend(actor: AuditActor, userId: string, reason: string): Promise<unknown> {
    return this.lifecycle.unsuspend(actor, userId, reason);
  }

  softDelete(actor: AuditActor, userId: string, reason: string): Promise<unknown> {
    return this.lifecycle.softDelete(actor, userId, { source: 'admin', reason });
  }

  restore(actor: AuditActor, userId: string, reason: string): Promise<unknown> {
    return this.lifecycle.restore(actor, userId, reason);
  }

  /**
   * Credit or debit the player's cash through the ledger (`adjustment`), in the character's session, with the audit
   * entry in the same transaction. The portal's idempotency key makes a double submit apply once.
   */
  async adjustWallet(actor: AuditActor, userId: string, request: WalletAdjustmentDto): Promise<WalletAdjustmentResultDto> {
    const reason = request.reason.trim();
    return this.session.run({ userId }, async (ctx) => {
      const key = `admin-adjustment:${request.idempotencyKey}`;
      const ledgerKey = `${ctx.character.id}:${key}`;
      if (await ctx.manager.exists(LedgerTransactionEntity, { where: { idempotencyKey: ledgerKey } })) {
        return { applied: false, amount: request.amount, cashAfter: ctx.wallet.cash };
      }
      const before = ctx.wallet.cash;
      const memo = 'Adjustment by Inside Life support';
      const metadata = { adminUserId: actor.userId, reason: reason.slice(0, 120) };
      if (request.amount > 0) {
        await ctx.wallet.receive(request.amount, 'adjustment', memo, key, { income: 'unearned', metadata });
      } else {
        await ctx.wallet.pay(-request.amount, 'adjustment', memo, key, { metadata });
      }
      const after = ctx.wallet.cash;
      ctx.notify({
        kind: 'money-received',
        title: request.amount > 0 ? 'Money added by support' : 'Money removed by support',
        body: `${request.amount > 0 ? '+' : '−'}${formatNaira(Math.abs(request.amount))}: ${reason}`,
        tone: request.amount > 0 ? 'good' : 'bad',
        amount: request.amount,
      });
      await this.audit.record(ctx.manager, actor, {
        action: 'wallet.adjust',
        target: { type: 'player', id: userId, label: characterLabel(ctx.character) },
        before: { cash: before },
        after: { cash: after },
        reason,
        metadata: { amount: request.amount, account: 'cash', ledgerKey, characterId: ctx.character.id },
      });
      return { applied: true, amount: request.amount, cashAfter: after };
    }, { touch: false });
  }

  /** Replace an abusive @handle with a neutral one (`player_xxxxxxxx`); the player can pick a new one later. */
  async resetHandle(actor: AuditActor, userId: string, reason: string): Promise<{ readonly handle: string }> {
    return this.session.run({ userId }, async (ctx) => {
      const character = ctx.character;
      const before = { handle: character.handle, label: characterLabel(character) };
      let handle = '';
      for (let attempt = 0; attempt < 5 && !handle; attempt++) {
        const candidate = `player_${randomBytes(4).toString('hex')}`;
        const taken = await ctx.manager.query<unknown[]>(`SELECT 1 FROM characters WHERE handle = $1`, [candidate]);
        if (taken.length === 0) handle = candidate;
      }
      if (!handle) throw new ResourceNotFoundException('A free handle');
      character.handle = handle;
      ctx.notify({
        kind: 'system',
        title: 'Your @handle was reset',
        body: `Your old handle broke our community rules, so it’s now @${handle}.`,
        tone: 'bad',
      });
      await this.audit.record(ctx.manager, actor, {
        action: 'player.handle-reset',
        target: { type: 'player', id: userId, label: before.label },
        before: { handle: before.handle },
        after: { handle },
        reason,
        metadata: { characterId: character.id },
      });
      return { handle };
    }, { touch: false });
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private where(query: PlayersQueryDto): SqlWhere {
    const status = query.status ?? 'all';
    return new SqlWhere()
      .when(query.q, (p, q) => {
        const like = p(containsPattern(q));
        const exact = q.trim().toLowerCase().replace(/^@/, '');
        const uuid = /^[0-9a-f-]{36}$/.test(exact) ? ` OR u.id = ${p(exact)}::uuid OR c.id = ${p(exact)}::uuid` : '';
        return `u.email ILIKE ${like} OR c.handle ILIKE ${p(containsPattern(exact))} OR (c.first_name || ' ' || c.last_name) ILIKE ${like}${uuid}`;
      })
      .when(status === 'all' ? undefined : status, (_p, value) => {
        switch (value) {
          case 'active':
            return 'u.suspended_at IS NULL AND u.deleted_at IS NULL';
          case 'suspended':
            return 'u.suspended_at IS NOT NULL AND u.deleted_at IS NULL';
          case 'deleted':
            return 'u.deleted_at IS NOT NULL AND u.purged_at IS NULL';
          default:
            return 'u.purged_at IS NOT NULL';
        }
      })
      .when(query.role, (p, role) => (role === 'admin' ? `(u.role = 'admin' OR u.email = ANY(${p(this.owners())}))` : `(u.role <> 'admin' AND NOT u.email = ANY(${p(this.owners())}))`))
      .when(query.hasCharacter, (_p, has) => (has ? 'c.id IS NOT NULL' : 'c.id IS NULL'))
      .when(query.from, (p, from) => `u.created_at >= ${p(new Date(from))}`)
      .when(query.to, (p, to) => `u.created_at < ${p(new Date(to))}`)
      .when(query.activeFrom, (p, from) => `COALESCE(c.last_active_at, u.last_login_at) >= ${p(new Date(from))}`)
      .when(query.activeTo, (p, to) => `COALESCE(c.last_active_at, u.last_login_at) < ${p(new Date(to))}`);
  }

  private columns(ownersParam: string): string {
    return `u.id AS user_id, u.email, u.email_verified_at,
            CASE WHEN u.email = ANY(${ownersParam}) THEN 'owner' ELSE u.role END AS role,
            u.created_at, u.last_login_at, u.suspended_at, u.deleted_at, u.purge_after, u.purged_at,
            c.id AS character_id, c.handle, c.first_name, c.last_name, c.alive, c.net_worth, c.last_active_at, c.hidden_at,
            cash.balance AS cash`;
  }

  private toRow(row: PlayerRow): AdminPlayerRowDto {
    return {
      userId: row.user_id,
      email: row.email,
      emailVerified: row.email_verified_at !== null,
      role: row.role,
      status: accountStatus({ suspendedAt: row.suspended_at, deletedAt: row.deleted_at, purgedAt: row.purged_at }),
      createdAt: row.created_at.toISOString(),
      lastLoginAt: iso(row.last_login_at),
      lastActiveAt: iso(row.last_active_at ?? row.last_login_at),
      suspendedAt: iso(row.suspended_at),
      deletedAt: iso(row.deleted_at),
      restorableUntil: row.deleted_at && !row.purged_at ? iso(row.purge_after) : null,
      cash: row.cash === null ? null : Number(row.cash),
      character:
        row.character_id && row.handle
          ? {
              id: row.character_id,
              handle: row.handle,
              firstName: row.first_name ?? '',
              lastName: row.last_name ?? '',
              alive: row.alive ?? false,
              netWorth: Number(row.net_worth ?? 0),
              hidden: row.hidden_at !== null,
            }
          : null,
    };
  }

  private async characterDetail(characterId: string): Promise<AdminPlayerDetailDto['character']> {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        handle: string;
        first_name: string;
        last_name: string;
        alive: boolean;
        net_worth: string;
        hidden_at: Date | null;
        gender: string;
        born_at: string;
        died_at: string | null;
        generation: number;
        lifestyle: string;
        health: number;
        location_id: string;
        home_district_id: string;
        status: number;
        earned_total: string;
        unearned_total: string;
        purchased_total: string;
        created_at: Date;
        last_active_at: Date;
        cause_of_death: string | null;
      }>
    >(
      `SELECT id, handle, first_name, last_name, alive, net_worth, hidden_at, gender, born_at, died_at, generation, lifestyle,
              health, location_id, home_district_id, status, earned_total, unearned_total, purchased_total, created_at,
              last_active_at, cause_of_death
         FROM characters WHERE id = $1`,
      [characterId],
    );
    const c = rows[0];
    if (!c) return null;
    const until = c.alive ? this.world.now() : Number(c.died_at ?? this.world.now());
    return {
      id: c.id,
      handle: c.handle,
      firstName: c.first_name,
      lastName: c.last_name,
      alive: c.alive,
      netWorth: Number(c.net_worth),
      hidden: c.hidden_at !== null,
      gender: c.gender,
      ageYears: Math.floor(yearsBetween(Number(c.born_at), until)),
      generation: c.generation,
      lifestyle: c.lifestyle,
      health: Math.round(c.health),
      locationId: c.location_id,
      homeDistrictId: c.home_district_id,
      clout: c.status,
      earnedTotal: Number(c.earned_total),
      unearnedTotal: Number(c.unearned_total),
      purchasedTotal: Number(c.purchased_total),
      createdAt: c.created_at.toISOString(),
      lastActiveAt: c.last_active_at.toISOString(),
      causeOfDeath: c.cause_of_death,
    };
  }

  private async wallet(characterId: string): Promise<AdminPlayerDetailDto['wallet']> {
    const rows = await this.dataSource.query<Array<{ kind: string; balance: string }>>(
      `SELECT kind, balance FROM ledger_accounts WHERE owner_id = $1`,
      [characterId],
    );
    if (rows.length === 0) return null;
    const of = (kind: string): number => Number(rows.find((row) => row.kind === kind)?.balance ?? 0);
    return { cash: of('cash'), savings: of('savings'), pension: of('pension'), usdCents: of('usd') };
  }

  private async properties(characterId: string): Promise<AdminPlayerDetailDto['properties']> {
    const rows = await this.dataSource.query<Array<{ id: string; label: string; district_id: string; title: string; status: string; plots: number; purchase_price: string; market_value: string }>>(
      `SELECT id, label, district_id, title, status, plots, purchase_price, market_value
         FROM housing_properties WHERE character_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [characterId],
    );
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      districtId: row.district_id,
      title: row.title,
      status: row.status,
      plots: row.plots,
      purchasePrice: Number(row.purchase_price),
      marketValue: Number(row.market_value),
    }));
  }

  private async vehicles(characterId: string): Promise<AdminPlayerDetailDto['vehicles']> {
    const rows = await this.dataSource.query<Array<{ id: string; vehicle_id: string; plate: string; status: string; condition: number; purchase_price: string; is_primary: boolean }>>(
      `SELECT id, vehicle_id, plate, status, condition, purchase_price, is_primary
         FROM owned_vehicles WHERE character_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [characterId],
    );
    return rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicle_id,
      name: findVehicle(row.vehicle_id)?.name ?? row.vehicle_id,
      plate: row.plate,
      status: row.status,
      condition: Math.round(row.condition),
      purchasePrice: Number(row.purchase_price),
      isPrimary: row.is_primary,
    }));
  }

  private async reports(userId: string): Promise<AdminPlayerDetailDto['reports']> {
    const mine = `SELECT id FROM characters WHERE user_id = $1`;
    const [counts, recent] = await Promise.all([
      this.dataSource.query<Array<{ open_against: string; total_against: string; filed: string }>>(
        `SELECT (SELECT count(*) FROM social_reports WHERE target_id IN (${mine}) AND status IN ('open', 'reviewing')) AS open_against,
                (SELECT count(*) FROM social_reports WHERE target_id IN (${mine})) AS total_against,
                (SELECT count(*) FROM social_reports WHERE reporter_id IN (${mine})) AS filed`,
        [userId],
      ),
      this.dataSource.query<Array<{ id: string; reason: string; status: string; reporter_handle: string | null; details: string | null; created_at: Date }>>(
        `SELECT r.id, r.reason, r.status, rc.handle AS reporter_handle, r.context->>'details' AS details, r.created_at
           FROM social_reports r LEFT JOIN characters rc ON rc.id = r.reporter_id
          WHERE r.target_id IN (${mine})
          ORDER BY r.created_at DESC LIMIT 20`,
        [userId],
      ),
    ]);
    const count = counts[0];
    return {
      openAgainst: Number(count?.open_against ?? 0),
      totalAgainst: Number(count?.total_against ?? 0),
      filed: Number(count?.filed ?? 0),
      recentAgainst: recent.map((report) => ({
        id: report.id,
        reason: report.reason,
        status: report.status,
        reporterHandle: report.reporter_handle,
        details: report.details,
        createdAt: report.created_at.toISOString(),
      })),
    };
  }

  private async payments(userId: string): Promise<AdminPlayerDetailDto['payments']> {
    const rows = await this.dataSource.query<Array<{ id: string; reference: string; purpose: string; description: string; amount_kobo: string; status: string; provider: string; created_at: Date }>>(
      `SELECT id, reference, purpose, description, amount_kobo, status, provider, created_at
         FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId],
    );
    return rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      purpose: row.purpose,
      description: row.description,
      amountKobo: Number(row.amount_kobo),
      status: row.status,
      provider: row.provider,
      createdAt: row.created_at.toISOString(),
    }));
  }

  private owners(): string[] {
    return [...this.config.get('adminEmails', { infer: true })];
  }
}

