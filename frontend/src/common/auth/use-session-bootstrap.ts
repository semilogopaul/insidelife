'use client';

import { useEffect } from 'react';
import { refreshSession } from '@/common/api/http';
import { useSession } from './session-store';

/** On first load, try to restore the session from the refresh cookie. */
export function useSessionBootstrap(): void {
  const status = useSession((state) => state.status);
  useEffect(() => {
    if (status === 'unknown') void refreshSession();
  }, [status]);
}
