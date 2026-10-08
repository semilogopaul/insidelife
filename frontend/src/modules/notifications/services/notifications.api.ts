import type { NotificationDto, Paginated } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const NOTIFICATIONS_PAGE_SIZE = 30;

export const notificationsApi = {
  page: (cursor: string | null, limit = NOTIFICATIONS_PAGE_SIZE) =>
    api.get<Paginated<NotificationDto>>('/notifications', { query: { cursor: cursor ?? undefined, limit } }),
  markAllRead: () => api.post<void>('/notifications/read'),
};
