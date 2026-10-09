import type {
  AccountDeletionDto,
  CharacterSnapshotDto,
  DeleteAccountRequest,
  Habit,
  InventoryDto,
  LeaderboardBoardId,
  LeaderboardDto,
  LifestyleTier,
  PlayerProfileDto,
  SocialPrivacyDto,
  TransportMode,
  UpdateSocialPrivacyRequest,
} from '@insidelife/shared';
import { api } from '@/common/api/http';

export const meApi = {
  updateSettings: (body: { lifestyle?: LifestyleTier; defaultTransport?: TransportMode }) => api.patch<CharacterSnapshotDto>('/characters/me/settings', body),
  profile: (handle: string) => api.get<PlayerProfileDto>(`/players/${encodeURIComponent(handle)}`),
  leaderboard: (board: LeaderboardBoardId) => api.get<LeaderboardDto>(`/leaderboards/${board}`),
  privacy: () => api.get<SocialPrivacyDto>('/players/me/privacy'),
  updatePrivacy: (body: UpdateSocialPrivacyRequest) => api.patch<SocialPrivacyDto>('/players/me/privacy', body),
  /** Soft delete: signs out everywhere; support can restore it within the restore window. */
  deleteAccount: (body: DeleteAccountRequest) => api.post<AccountDeletionDto>('/account/deletion', body),
};

/** Habits and inventory tags (for habit requirements). */
export const habitsApi = {
  save: (habits: readonly Habit[]) => api.patch<CharacterSnapshotDto>('/characters/me/settings', { habits }),
  inventoryTags: async (): Promise<readonly string[]> => (await api.get<InventoryDto>('/inventory')).tags,
};
