import type { NotificationDto, Paginated } from '@insidelife/shared';
import { api } from '@/common/api/http';

const PAGE = 50;
const MAX_PAGES = 4;

export const awayApi = {
  /** Notifications newer than `sinceMs` (pages until older items appear, capped). */
  async since(sinceMs: number): Promise<NotificationDto[]> {
    const items: NotificationDto[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result: Paginated<NotificationDto> = await api.get<Paginated<NotificationDto>>('/notifications', { query: { cursor: cursor ?? undefined, limit: PAGE } });
      items.push(...result.items);
      const oldest = result.items.at(-1);
      if (!result.nextCursor || !oldest || Date.parse(oldest.createdAt) < sinceMs) break;
      cursor = result.nextCursor;
    }
    return items;
  },
  markAllRead: () => api.post<void>('/notifications/read'),
};
