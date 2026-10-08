'use client';

import { Map as MapIcon } from 'lucide-react';
import { useState } from 'react';
import { GIFT_LIMITS, RING_LIMITS, WEDDINGS, WEDDING_TIERS, formatNaira, type InteractionRequest, type RelationshipDto, type WeddingTier } from '@insidelife/shared';
import { Button, HoldButton } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';
import { previewInteraction, weddingCost, type InteractionPreview, type PreviewContext } from '../services/interaction-preview';

const GIFT_STEPS = [5_000, 20_000, 50_000, 150_000, 500_000] as const;
const RING_STEPS = [150_000, 350_000, 750_000, 1_500_000, 3_000_000, 5_000_000] as const;
/** Spending at least this (or anything irreversible) needs a hold to confirm. */
const HOLD_FROM = 100_000;
const DANGER = new Set(['break-up', 'divorce']);

export interface InteractionRowProps {
  readonly preview: InteractionPreview;
  readonly rel: RelationshipDto;
  readonly ctx: PreviewContext;
  readonly busy: boolean;
  readonly onRun: (request: InteractionRequest) => void;
}

const pct = (odds: number): string => `${Math.round(odds * 100)}%`;

/** One thing you can do with someone: requirements, cost and odds up front, then a config step when needed. */
export function InteractionRow({ preview, rel, ctx, busy, onRun }: InteractionRowProps) {
  const [open, setOpen] = useState(false);
  const openPhone = useUi((state) => state.openPhone);
  const { definition } = preview;
  const configurable = definition.needsAmount !== undefined || definition.needsTier === true;
  const confirmable = configurable || DANGER.has(definition.id) || (preview.cost ?? 0) >= HOLD_FROM;

  return (
    <li className={cn('rounded-card p-3', preview.blocked ? 'bg-paper-2/60' : 'bg-paper-2')}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none">
          {definition.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('font-bold leading-tight', preview.blocked && 'text-text-soft')}>{definition.label}</p>
          <p className="mt-0.5 text-sm text-text-soft">{definition.blurb}</p>
          <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="rounded-chip bg-paper px-2 py-0.5 ring-1 ring-line">{preview.cost === null ? 'You choose' : preview.cost === 0 ? 'Free' : formatNaira(preview.cost)}</span>
            {preview.odds !== null && <span className="rounded-chip bg-paper px-2 py-0.5 ring-1 ring-line">About {pct(preview.odds)} yes</span>}
            {preview.viaProposal && <span className="rounded-chip bg-cobalt-soft px-2 py-0.5 text-cobalt">Sends a request</span>}
          </p>
          {preview.costNote && <p className="mt-1 text-xs text-text-soft">{preview.costNote}</p>}
          {preview.blocked && (
            <p className="mt-1.5 text-sm text-okada">
              {preview.blocked}
              {preview.fix === 'map' && (
                <button type="button" onClick={() => openPhone('map')} className="ml-2 inline-flex items-center gap-1 font-bold text-ink underline underline-offset-2">
                  <MapIcon size={14} aria-hidden /> Find a spot
                </button>
              )}
            </p>
          )}
        </div>
        {!preview.blocked && !open && (
          <Button
            size="sm"
            variant={DANGER.has(definition.id) ? 'paper' : 'danfo'}
            loading={busy && !confirmable}
            disabled={busy}
            onClick={() => (confirmable ? setOpen(true) : onRun({ type: definition.id }))}
          >
            {confirmable ? 'Choose' : 'Go'}
          </Button>
        )}
      </div>
      {open && !preview.blocked && <Configure preview={preview} rel={rel} ctx={ctx} busy={busy} onRun={onRun} onCancel={() => setOpen(false)} />}
    </li>
  );
}

function Configure({ preview, rel, ctx, busy, onRun, onCancel }: InteractionRowProps & { readonly onCancel: () => void }) {
  const { definition } = preview;
  const steps = definition.id === 'propose' ? RING_STEPS : GIFT_STEPS;
  const limits = definition.id === 'propose' ? RING_LIMITS : GIFT_LIMITS;
  const [amount, setAmount] = useState<number>(steps[1] ?? limits.min);
  const [tier, setTier] = useState<WeddingTier>('modest');
  const live = previewInteraction(definition.id, rel, ctx, { amount: definition.needsAmount ? amount : undefined, tier: definition.needsTier ? tier : undefined });
  const cost = definition.needsTier ? weddingCost(tier, rel, ctx.priceIndex) : (live.cost ?? 0);
  const request: InteractionRequest = { type: definition.id, amount: definition.needsAmount ? amount : undefined, tier: definition.needsTier ? tier : undefined };
  const danger = DANGER.has(definition.id);

  return (
    <div className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3">
      {definition.needsAmount && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">{definition.id === 'propose' ? 'Ring value' : 'How much'}</legend>
          <div className="flex flex-wrap gap-1.5">
            {steps
              .filter((step) => step >= limits.min && step <= limits.max)
              .map((step) => (
                <button
                  key={step}
                  type="button"
                  aria-pressed={amount === step}
                  onClick={() => setAmount(step)}
                  className={cn('h-10 rounded-chip px-3 text-sm font-bold', amount === step ? 'bg-ink text-on-ink' : 'bg-paper ring-1 ring-line')}
                >
                  {formatNaira(step)}
                </button>
              ))}
          </div>
          {live.odds !== null && <p className="mt-1.5 text-xs font-bold text-text-soft">With this ring: about {pct(live.odds)} chance of yes</p>}
        </fieldset>
      )}
      {definition.needsTier && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-bold">Style</legend>
          {WEDDING_TIERS.map((id) => (
            <label key={id} className={cn('flex cursor-pointer items-start gap-3 rounded-card p-2.5 ring-1', tier === id ? 'bg-danfo-soft ring-danfo' : 'bg-paper ring-line')}>
              <input type="radio" name={`tier-${rel.id}`} checked={tier === id} onChange={() => setTier(id)} className="mt-1 size-4 accent-[var(--color-ink)]" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{WEDDINGS[id].label}</span>
                  <span className="tabular shrink-0 text-sm font-bold">{formatNaira(weddingCost(id, rel, ctx.priceIndex))}</span>
                </span>
                <span className="block text-xs text-text-soft">
                  {WEDDINGS[id].blurb} {WEDDINGS[id].guests.toLocaleString('en-NG')} guests.
                </span>
              </span>
            </label>
          ))}
          {!rel.isPlayer && rel.wealth && <p className="text-xs text-text-soft">Prices include what {rel.firstName}’s family chips in.</p>}
        </fieldset>
      )}
      {live.blocked && <p className="text-sm text-okada">{live.blocked}</p>}
      <HoldButton disabled={busy || live.blocked !== null} onConfirm={() => onRun(request)} className={danger ? 'bg-okada' : undefined}>
        {danger ? `Hold to ${definition.label.toLowerCase()}` : `Hold to confirm${cost > 0 ? ` — ${formatNaira(cost)}` : ''}`}
      </HoldButton>
      <Button variant="ghost" size="sm" className="self-center text-text-soft hover:bg-paper-3" onClick={onCancel}>
        Not now
      </Button>
    </div>
  );
}
