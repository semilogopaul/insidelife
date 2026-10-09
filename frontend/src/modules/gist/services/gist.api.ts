import type {
  BlockedPlayerDto,
  ChatMessageDto,
  CreatePartyRequest,
  CreatePartyResultDto,
  CreateProposalRequest,
  FriendDto,
  FriendRequestResultDto,
  FriendsOverviewDto,
  Paginated,
  PartyDetailDto,
  PartyDto,
  PartyQuoteDto,
  PartyQuoteRequest,
  PlayerProfileDto,
  PlayerReportDto,
  PlayerSearchResultDto,
  ProposalDto,
  RelationshipDto,
  ReportPlayerRequest,
  SprayRequest,
  SprayResultDto,
  VenuePlayersDto,
  DmStateDto,
  DmThreadDto,
  ChatMediaKind,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { uploadMultipart } from '@/common/api/upload';

const handlePath = (handle: string): string => encodeURIComponent(handle.replace(/^@/, ''));

export const CHAT_PAGE_SIZE = 40;

export const gistApi = {
  // Chat history (text goes over the socket; voice notes and photos are uploaded here and pushed back over it).
  dmThreads: () => api.get<DmThreadDto[]>('/chat/dms'),
  dmState: (channel: string) => api.get<DmStateDto>(`/chat/dms/${encodeURIComponent(channel)}/state`),
  acceptRequest: (channel: string) => api.post<DmStateDto>(`/chat/dms/${encodeURIComponent(channel)}/accept`),
  declineRequest: (channel: string) => api.post<DmStateDto>(`/chat/dms/${encodeURIComponent(channel)}/decline`),
  sendMedia: (channel: string, kind: ChatMediaKind, file: File) => uploadMultipart<ChatMessageDto>(`/chat/dms/${encodeURIComponent(channel)}/media`, file, { kind }),
  markDmRead: (channel: string) => api.post<void>(`/chat/dms/${encodeURIComponent(channel)}/read`),
  history: (channel: string, cursor: string | null) =>
    api.get<Paginated<ChatMessageDto>>(`/chat/channels/${encodeURIComponent(channel)}/messages`, { query: { cursor: cursor ?? undefined, limit: CHAT_PAGE_SIZE } }),

  // Players
  search: (query: string) => api.get<PlayerSearchResultDto>('/players', { query: { query } }),
  profile: (handle: string) => api.get<PlayerProfileDto>(`/players/${handlePath(handle)}`),
  venuePlayers: (venueId: string) => api.get<VenuePlayersDto>(`/venues/${encodeURIComponent(venueId)}/players`),

  // Friends
  friends: () => api.get<FriendsOverviewDto>('/friends'),
  requestFriend: (handle: string) => api.post<FriendRequestResultDto>('/friends/requests', { handle: handle.replace(/^@/, '') }),
  acceptFriend: (requestId: string) => api.post<FriendDto>(`/friends/requests/${requestId}/accept`),
  declineFriend: (requestId: string) => api.post<void>(`/friends/requests/${requestId}/decline`),
  removeFriend: (characterId: string) => api.delete<void>(`/friends/${characterId}`),

  // Safety
  blocked: () => api.get<BlockedPlayerDto[]>('/blocks'),
  block: (handle: string) => api.post<BlockedPlayerDto>('/blocks', { handle: handle.replace(/^@/, '') }),
  unblock: (characterId: string) => api.delete<void>(`/blocks/${characterId}`),
  report: (body: ReportPlayerRequest) => api.post<PlayerReportDto>('/reports', body),

  // Romance with players goes through consent proposals (owned by the family domain).
  propose: (handle: string, body: CreateProposalRequest) => api.post<ProposalDto>(`/players/${handlePath(handle)}/proposals`, body),
  relationships: () => api.get<RelationshipDto[]>('/relationships'),

  // Parties
  parties: () => api.get<PartyDto[]>('/parties'),
  party: (id: string) => api.get<PartyDetailDto>(`/parties/${id}`),
  quote: (request: PartyQuoteRequest) =>
    api.get<PartyQuoteDto>('/parties/quotes', {
      query: { venueId: request.venueId, tier: request.tier, durationHours: request.durationHours, startsInMinutes: request.startsInMinutes },
    }),
  hostParty: (body: CreatePartyRequest) => api.post<CreatePartyResultDto>('/parties', body),
  cancelParty: (id: string) => api.delete<PartyDto>(`/parties/${id}`),
  attend: (id: string) => api.post<PartyDetailDto>(`/parties/${id}/attendance`),
  spray: (id: string, body: SprayRequest) => api.post<SprayResultDto>(`/parties/${id}/sprays`, body),
};
