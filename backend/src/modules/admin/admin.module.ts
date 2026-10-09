import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CharactersModule } from '../characters/characters.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { SocialModule } from '../social/social.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminAccountsController } from './admins/admin-accounts.controller.js';
import { AdminAccountsService } from './admins/admin-accounts.service.js';
import { AdminAuditController } from './audit/admin-audit.controller.js';
import { AdminAuthController } from './auth/admin-auth.controller.js';
import { AdminAuthGuard } from './auth/admin-auth.guard.js';
import { AdminAuthService } from './auth/admin-auth.service.js';
import { adminKeyProviders } from './auth/admin-keys.js';
import { AdminMfaEntity } from './auth/entities/admin-mfa.entity.js';
import { AdminSessionEntity } from './auth/entities/admin-session.entity.js';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller.js';
import { AdminDashboardService } from './dashboard/admin-dashboard.service.js';
import { AdminModerationController } from './moderation/admin-moderation.controller.js';
import { AdminModerationService } from './moderation/admin-moderation.service.js';
import { AdminPaymentsController } from './payments/admin-payments.controller.js';
import { AdminPaymentsService } from './payments/admin-payments.service.js';
import { AdminPlayersController } from './players/admin-players.controller.js';
import { AdminPlayersService } from './players/admin-players.service.js';
import { AdminReportsController } from './reports/admin-reports.controller.js';
import { AdminReportsService } from './reports/admin-reports.service.js';

/**
 * The admin API (`/api/v1/admin/*`) behind the separate admin portal: its own sign-in (password + authenticator code,
 * short-lived admin tokens), players, moderation, reports, payments, the dashboard, the audit log and admin accounts.
 * Reads are read models over the domain tables; every change goes through the owning module's service and is audited
 * in the same transaction. Sits on top of every other module; nothing imports it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AdminMfaEntity, AdminSessionEntity]),
    AuthModule,
    UsersModule,
    CharactersModule,
    AccountsModule,
    SimulationModule,
    PresenceModule,
    PromotionsModule,
    SocialModule,
  ],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminPlayersController,
    AdminModerationController,
    AdminReportsController,
    AdminPaymentsController,
    AdminAuditController,
    AdminAccountsController,
  ],
  providers: [
    ...adminKeyProviders,
    AdminAuthService,
    AdminAuthGuard,
    AdminPlayersService,
    AdminModerationService,
    AdminReportsService,
    AdminPaymentsService,
    AdminDashboardService,
    AdminAccountsService,
  ],
})
export class AdminModule {}
