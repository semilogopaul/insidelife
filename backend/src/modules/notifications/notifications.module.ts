import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './entities/notification.entity.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity])],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
