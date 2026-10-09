import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service.js';
import { AuditLogEntity } from './entities/audit-log.entity.js';

/**
 * Global: any module that makes an auditable change (accounts, moderation, the admin API) records it with
 * `AuditService.record(manager, actor, entry)` inside its own transaction. Depends on nothing domain-specific.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
