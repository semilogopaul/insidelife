'use client';

import { LIFESTYLES, LIFESTYLE_TIERS, formatNaira, type LifestyleTier } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { useSnapshotMutation } from '@/common/game/snapshot';
import { cn } from '@/common/utils/cn';
import { meApi } from '../services/me.api';

/** How you live day to day — higher tiers keep you happier and cost more every day. */
export function LifestylePicker({ current }: { readonly current: LifestyleTier }) {
  const lifestyle = useSnapshotMutation((tier: LifestyleTier) => meApi.updateSettings({ lifestyle: tier }));
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h4 className="type-title text-lg">Lifestyle</h4>
        <p className="text-sm text-text-soft">How you live day to day. Higher tiers keep you happier — and cost more every day.</p>
      </div>
      {LIFESTYLE_TIERS.map((tier) => (
        <button
          key={tier}
          type="button"
          disabled={lifestyle.isPending}
          aria-pressed={current === tier}
          onClick={() => lifestyle.mutate(tier, { onError: (error) => toast({ title: 'Couldn’t change lifestyle', body: errorMessage(error), tone: 'bad' }) })}
          className={cn('flex items-center justify-between gap-3 rounded-card p-3 text-left ring-1', current === tier ? 'bg-danfo-soft ring-danfo' : 'bg-paper-2 ring-transparent hover:bg-paper-3')}
        >
          <span>
            <span className="block font-bold">{LIFESTYLES[tier].label}</span>
            <span className="block text-sm text-text-soft">{LIFESTYLES[tier].blurb}</span>
          </span>
          <span className="tabular shrink-0 text-sm font-bold">{formatNaira(LIFESTYLES[tier].dailyCost)}/day</span>
        </button>
      ))}
    </section>
  );
}
