'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/common/api/http';
import { disconnectSocket } from '@/common/realtime/socket';
import { useSession } from './session-store';

/** Sign out everywhere this device knows about: revoke the refresh token, drop caches, close the socket. */
export function useSignOut() {
  const router = useRouter();
  const client = useQueryClient();
  const clear = useSession((state) => state.clear);
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout', undefined, { anonymous: true }),
    onSettled: () => {
      disconnectSocket();
      clear();
      client.clear();
      router.replace('/');
    },
  });
}
