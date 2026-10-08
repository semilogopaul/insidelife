import { queryKeys } from '@/common/api/query-keys';

/** Query keys owned by the Bank (the wallet itself uses the shared `queryKeys.wallet`). */
export const bankKeys = {
  statement: queryKeys.domain('bank', 'statement'),
  packages: queryKeys.domain('bank', 'topup-packages'),
  payments: queryKeys.domain('bank', 'payments'),
  playerSearch: (query: string) => queryKeys.domain('bank', 'player-search', query),
  player: (handle: string) => queryKeys.domain('bank', 'player', handle),
} as const;
