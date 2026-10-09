'use client';

import { useMutation } from '@tanstack/react-query';
import { api } from '@/common/api/http';
import { disconnectSocket } from '@/common/realtime/socket';

/**
 * Sign out on this device: revoke the refresh token, close the socket, then load `to` (the landing page by default;
 * the sign-in or sign-up page when the player is backing out of a flow). A full page load drops every in-memory trace
 * of the session (token, caches, the 3D world) and can't race a screen's own "not signed in → sign-in page" guard.
 */
export function useSignOut(to = '/') {
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout', undefined, { anonymous: true }),
    onSettled: () => {
      disconnectSocket();
      window.location.replace(to);
    },
  });
}
