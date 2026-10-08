import { queryKeys } from '@/common/api/query-keys';

/** Query keys for social server state (shared names so other apps reading the same data hit the same cache). */
export const gistKeys = {
  chat: (channel: string) => queryKeys.domain('gist', 'chat', channel),
  dmThreads: queryKeys.domain('gist', 'dm-threads'),
  friends: queryKeys.domain('social', 'friends'),
  blocked: queryKeys.domain('social', 'blocked'),
  profile: (handle: string) => queryKeys.domain('social', 'profile', handle.replace(/^@/, '').toLowerCase()),
  profiles: queryKeys.domain('social', 'profile'),
  search: (query: string) => queryKeys.domain('social', 'search', query.toLowerCase()),
  venuePlayers: (venueId: string) => queryKeys.domain('social', 'venue-players', venueId),
  parties: queryKeys.domain('social', 'parties'),
  party: (id: string) => queryKeys.domain('social', 'parties', id),
  quote: (key: string) => queryKeys.domain('social', 'party-quote', key),
  relationships: queryKeys.domain('relationships'),
};
