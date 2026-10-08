'use client';

import { errorMessage } from '@/common/api/api-error';
import { Spinner, toast } from '@/common/components';
import type { ProfileLocationVisibility } from '@insidelife/shared';
import { usePrivacy, useUpdatePrivacy } from '../hooks/use-me';

/** What other players can see: exact wealth (or just a band) and where you are. */
export function PrivacySettings() {
  const privacy = usePrivacy();
  const update = useUpdatePrivacy();
  const onError = (error: unknown): void => toast({ title: 'Couldn’t save that', body: errorMessage(error), tone: 'bad' });

  if (privacy.isPending) return <Spinner className="text-text-soft" />;
  if (!privacy.data) return <p className="text-sm text-okada">{errorMessage(privacy.error)}</p>;
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start justify-between gap-4">
        <span>
          <span className="block font-bold">Show exact wealth</span>
          <span className="block text-sm text-text-soft">Off: others see a band like “₦10M+”. On: your exact self-made figure and income on your profile and leaderboards.</span>
        </span>
        <input
          type="checkbox"
          checked={privacy.data.showExactWealth}
          onChange={(event) => update.mutate({ showExactWealth: event.target.checked }, { onError })}
          className="mt-1 size-5 shrink-0 accent-[var(--color-ink)]"
        />
      </label>
      <label className="flex items-start justify-between gap-4">
        <span>
          <span className="block font-bold">Who can see where you are</span>
          <span className="block text-sm text-text-soft">Strangers never see your location.</span>
        </span>
        <select
          value={privacy.data.locationVisibility}
          onChange={(event) => update.mutate({ locationVisibility: event.target.value as ProfileLocationVisibility }, { onError })}
          className="h-10 shrink-0 rounded-chip bg-paper-2 px-2 font-bold"
        >
          <option value="friends">Friends</option>
          <option value="nobody">Nobody</option>
        </select>
      </label>
    </div>
  );
}
