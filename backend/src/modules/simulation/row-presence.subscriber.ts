import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { BeforeQueryEvent, DataSource, EntitySubscriberInterface } from 'typeorm';
import { ROW_PRESENCE, type RowPresence } from './row-presence.js';

/**
 * Tells a session's `RowPresence` about every statement its transaction runs (TypeORM's `beforeQuery` hook sees them
 * all: finds, saves, query builders and raw SQL), so a write to a probed table is never answered from an old probe.
 */
@Injectable()
export class RowPresenceSubscriber implements EntitySubscriberInterface {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  beforeQuery(event: BeforeQueryEvent): void {
    const presence = event.queryRunner?.data?.[ROW_PRESENCE] as RowPresence | undefined;
    presence?.noteQuery(event.query);
  }
}
