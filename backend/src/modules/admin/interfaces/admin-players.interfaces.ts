import type { AccountStatus } from '../../accounts/account-status.js';
import type { AuditEntryDto } from '../../audit/audit.types.js';
import type { Page } from '../../../common/utils/paging.js';

export interface AdminCharacterSummaryDto {
  readonly id: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly alive: boolean;
  readonly netWorth: number;
  readonly hidden: boolean;
}

/** A row in the players table. */
export interface AdminPlayerRowDto {
  readonly userId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  /** `owner` = in ADMIN_EMAILS. */
  readonly role: 'player' | 'admin' | 'owner';
  readonly status: AccountStatus;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
  readonly lastActiveAt: string | null;
  readonly suspendedAt: string | null;
  readonly deletedAt: string | null;
  /** Until when a deleted account can be restored. */
  readonly restorableUntil: string | null;
  readonly cash: number | null;
  readonly character: AdminCharacterSummaryDto | null;
}

export interface AdminLedgerEntryDto {
  readonly id: string;
  readonly transactionId: string;
  readonly account: string;
  readonly kind: string;
  readonly memo: string;
  /** Signed: positive is money in. Whole naira (US cents on the usd account). */
  readonly amount: number;
  readonly balanceAfter: number | null;
  readonly counterparty: string | null;
  readonly createdAt: string;
}

export interface AdminPlayerDetailDto {
  readonly account: AdminPlayerRowDto & {
    readonly birthDate: string | null;
    readonly suspensionReason: string | null;
    readonly suspendedBy: string | null;
    readonly deletedBy: string | null;
    readonly deletedBySelf: boolean;
    readonly canRestore: boolean;
    readonly purgedAt: string | null;
  };
  readonly character:
    | (AdminCharacterSummaryDto & {
        readonly gender: string;
        readonly ageYears: number;
        readonly generation: number;
        readonly lifestyle: string;
        readonly health: number;
        readonly locationId: string;
        readonly homeDistrictId: string;
        readonly clout: number;
        readonly earnedTotal: number;
        readonly unearnedTotal: number;
        readonly purchasedTotal: number;
        readonly createdAt: string;
        readonly lastActiveAt: string;
        readonly causeOfDeath: string | null;
      })
    | null;
  readonly wallet: { readonly cash: number; readonly savings: number; readonly pension: number; readonly usdCents: number } | null;
  readonly ledger: Page<AdminLedgerEntryDto>;
  readonly properties: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly districtId: string;
    readonly title: string;
    readonly status: string;
    readonly plots: number;
    readonly purchasePrice: number;
    readonly marketValue: number;
  }>;
  readonly vehicles: ReadonlyArray<{
    readonly id: string;
    readonly vehicleId: string;
    readonly name: string;
    readonly plate: string;
    readonly status: string;
    readonly condition: number;
    readonly purchasePrice: number;
    readonly isPrimary: boolean;
  }>;
  readonly reports: {
    readonly openAgainst: number;
    readonly totalAgainst: number;
    readonly filed: number;
    readonly recentAgainst: ReadonlyArray<{
      readonly id: string;
      readonly reason: string;
      readonly status: string;
      readonly reporterHandle: string | null;
      readonly details: string | null;
      readonly createdAt: string;
    }>;
  };
  readonly payments: ReadonlyArray<{
    readonly id: string;
    readonly reference: string;
    readonly purpose: string;
    readonly description: string;
    readonly amountKobo: number;
    readonly status: string;
    readonly provider: string;
    readonly createdAt: string;
  }>;
  readonly audit: readonly AuditEntryDto[];
}

export interface WalletAdjustmentResultDto {
  /** False when this idempotency key was already used (nothing changed this time). */
  readonly applied: boolean;
  readonly amount: number;
  readonly cashAfter: number;
}
