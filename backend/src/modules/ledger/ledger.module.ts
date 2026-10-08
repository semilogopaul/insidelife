import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerAccountEntity } from './entities/ledger-account.entity.js';
import { LedgerEntryEntity } from './entities/ledger-entry.entity.js';
import { LedgerSystemDeltaEntity } from './entities/ledger-system-delta.entity.js';
import { LedgerTransactionEntity } from './entities/ledger-transaction.entity.js';
import { LedgerRollupScheduler } from './ledger-rollup.scheduler.js';
import { LedgerService } from './ledger.service.js';

/** Global: every domain that moves money depends on the ledger, and the ledger depends on nothing domain-specific. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LedgerAccountEntity, LedgerTransactionEntity, LedgerEntryEntity, LedgerSystemDeltaEntity])],
  providers: [LedgerService, LedgerRollupScheduler],
  exports: [LedgerService],
})
export class LedgerModule {}
