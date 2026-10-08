'use client';

import { useEffect, useRef } from 'react';
import { disposeLater, keepAlive } from '../../city/lib/deferred-dispose';

/**
 * Dispose a GPU resource when the component unmounts — deferred a tick so React StrictMode's mount → unmount →
 * remount keeps the same object alive instead of leaving the component holding a disposed one.
 */
export function useDisposeOnUnmount(resource: object, dispose: () => void): void {
  const latest = useRef(dispose);
  useEffect(() => {
    latest.current = dispose;
  });
  useEffect(() => {
    keepAlive(resource);
    return () => disposeLater(resource, () => latest.current());
  }, [resource]);
}
