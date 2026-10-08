'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/common/components';
import { useEpitaphData } from '../hooks/use-epitaph-data';
import { EpitaphScreen } from './EpitaphScreen';

export interface EpitaphGateProps {
  /** Where "Start a new life" goes. */
  readonly createPath?: string;
}

/**
 * Render this when `GET /characters/me` answers NO_CHARACTER: if a previous life exists it gets its epitaph first;
 * a brand-new player (no previous life) goes straight to the character creator.
 */
export function EpitaphGate({ createPath = '/create' }: EpitaphGateProps) {
  const router = useRouter();
  const client = useQueryClient();
  const { lastLife, legacy } = useEpitaphData(true);
  const noPreviousLife = lastLife.isSuccess && lastLife.data === null;

  useEffect(() => {
    if (noPreviousLife || lastLife.isError) router.replace(createPath);
  }, [noPreviousLife, lastLife.isError, router, createPath]);

  if (!lastLife.data || legacy.isPending) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[#0a1d26] text-on-ink-soft">
        <Spinner size={28} />
      </div>
    );
  }
  return (
    <EpitaphScreen
      lastLife={lastLife.data}
      legacy={legacy.data ?? []}
      onContinue={() => void client.invalidateQueries()}
      onStartNewLife={() => router.push(createPath)}
    />
  );
}
