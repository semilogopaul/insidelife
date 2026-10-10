import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-error';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failures, error) => {
          // A busy server (429) is worth another go; any other 4xx is a definite answer.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500 && !error.isBusy) return false;
          return failures < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
