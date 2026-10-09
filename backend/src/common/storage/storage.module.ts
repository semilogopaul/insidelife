import { Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';

/** One S3 client per process, shared by every domain that stores media (promotions, chat). */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
