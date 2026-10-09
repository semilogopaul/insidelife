import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CharactersModule } from '../characters/characters.module.js';
import { UsersModule } from '../users/users.module.js';
import { AccountLifecycleService } from './account-lifecycle.service.js';
import { ACCOUNT_MAINTENANCE_QUEUE, AccountPurgeProcessor, AccountPurgeScheduler } from './account-purge.processor.js';
import { AccountsController } from './accounts.controller.js';

/**
 * Account lifecycle: players deleting their own account, admins suspending / deleting / restoring accounts
 * (`AccountLifecycleService`, used by the admin API), and the hourly purge of deleted accounts past the restore window.
 */
@Module({
  imports: [AuthModule, UsersModule, CharactersModule, BullModule.registerQueue({ name: ACCOUNT_MAINTENANCE_QUEUE })],
  controllers: [AccountsController],
  providers: [AccountLifecycleService, AccountPurgeProcessor, AccountPurgeScheduler],
  exports: [AccountLifecycleService],
})
export class AccountsModule {}
