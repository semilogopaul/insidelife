'use client';

import { Check, Circle, Heart, MessagesSquare } from 'lucide-react';
import {
  MINUTES_PER_DAY,
  RELATIONSHIP_KIND_LABELS,
  TRAITS,
  WEALTH,
  formatDate,
  isRomanticKind,
  type InteractionRequest,
  type RelationshipDto,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Badge, Button, Sheet, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { useInteract, usePreviewContext } from '../hooks/use-family';
import { interactionsFor, previewInteraction } from '../services/interaction-preview';
import { InteractionRow } from './InteractionRow';
import { PersonAvatar } from './PersonAvatar';

export interface PersonSheetProps {
  readonly relationships: readonly RelationshipDto[];
  readonly relationshipId: string | null;
  readonly onClose: () => void;
}

const capitalise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/** Someone in your life: who they are, how close you are, and everything you can do together. */
export function PersonSheet({ relationships, relationshipId, onClose }: PersonSheetProps) {
  const rel = relationships.find((candidate) => candidate.id === relationshipId) ?? null;
  return (
    <Sheet
      open={relationshipId !== null}
      onClose={onClose}
      title={rel ? `${rel.firstName} ${rel.lastName}` : ''}
      description={rel ? `${RELATIONSHIP_KIND_LABELS[rel.kind]}${rel.alive ? `, ${rel.age}` : ' (late)'}` : undefined}
      size="md"
    >
      {rel ? <PersonBody rel={rel} relationships={relationships} /> : <p className="py-8 text-center text-sm text-text-soft">This person isn’t in your circle any more.</p>}
    </Sheet>
  );
}

function PersonBody({ rel, relationships }: { readonly rel: RelationshipDto; readonly relationships: readonly RelationshipDto[] }) {
  const ctx = usePreviewContext(relationships, rel.id);
  const interact = useInteract();
  const openPhone = useUi((state) => state.openPhone);
  const romantic = isRomanticKind(rel.kind) || rel.romance > 0;

  const run = (request: InteractionRequest): void => {
    gameEvents.emit('sfx', { id: 'ui-click' });
    interact.mutate(
      { relationshipId: rel.id, request },
      {
        onSuccess: (result) => {
          if (result.proposalId) {
            gameEvents.emit('sfx', { id: 'ui-success' });
            toast({ title: 'Request sent', body: `${rel.firstName} will see it and decide.`, tone: 'neutral', amount: result.moneyDelta || undefined });
            return;
          }
          gameEvents.emit('sfx', { id: result.success ? (result.moneyDelta < 0 ? 'cash-out' : 'ui-success') : 'ui-error' });
          toast({ title: result.title, body: result.body, tone: result.tone, amount: result.moneyDelta || undefined });
          if (result.moment) gameEvents.emit('social-moment', result.moment);
          if (result.success && request.type === 'propose') gameEvents.emit('celebrate', { kind: 'milestone', title: 'Engaged!', body: `${rel.firstName} said yes. Time to meet the families.` });
        },
        onError: (error) => {
          gameEvents.emit('sfx', { id: 'ui-error' });
          toast({ title: 'That didn’t work', body: errorMessage(error), tone: 'bad' });
        },
      },
    );
  };

  const types = interactionsFor(rel);
  return (
    <div className="flex flex-col gap-4 pb-3">
      <div className="flex items-center gap-4">
        <PersonAvatar firstName={rel.firstName} lastName={rel.lastName} kind={rel.kind} closeness={rel.alive ? rel.closeness : undefined} alive={rel.alive} size="lg" />
        <div className="min-w-0">
          <p className="flex flex-wrap gap-1.5">
            {rel.isPlayer && <Badge tone="info">Player @{rel.handle}</Badge>}
            {rel.wealth && <Badge>{WEALTH[rel.wealth].label}</Badge>}
            {rel.ethnicity && rel.ethnicity !== 'other' && <Badge>{capitalise(rel.ethnicity)}</Badge>}
          </p>
          {rel.occupation && <p className="mt-1 font-bold">{rel.occupation}</p>}
          <p className="text-sm text-text-soft">
            {rel.metAt ? `Met: ${rel.metAt.label}` : 'In your life'}, since {formatDate(rel.since)}
          </p>
        </div>
      </div>

      {rel.traits.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Personality">
          {rel.traits.map((trait) => (
            <li key={trait} title={TRAITS[trait].blurb} className="rounded-full bg-paper-2 px-2.5 py-1 text-xs font-bold">
              <span aria-hidden>{TRAITS[trait].emoji}</span> {TRAITS[trait].label}
            </li>
          ))}
        </ul>
      )}

      {rel.alive && (
        <div className="flex flex-col gap-2">
          <Meter label="Closeness" value={rel.closeness} tone="bg-naira" hint="Fades without contact" />
          {romantic && <Meter label="Romance" value={rel.romance} tone="bg-ankara" hint="Fades without dates and attention" />}
        </div>
      )}

      {isRomanticKind(rel.kind) && ctx && <CoupleStatus rel={rel} now={ctx.now} />}

      {rel.isPlayer && rel.handle && (
        <Button variant="paper" icon={<MessagesSquare size={18} aria-hidden />} onClick={() => openPhone('gist', `@${rel.handle}`)}>
          Open their profile in Gist
        </Button>
      )}

      {ctx && types.length > 0 && (
        <section aria-label="Things to do together" className="flex flex-col gap-2">
          <h3 className="type-title text-lg">Things to do</h3>
          <ul className="flex flex-col gap-1.5">
            {types.map((type) => (
              <InteractionRow key={type} preview={previewInteraction(type, rel, ctx)} rel={rel} ctx={ctx} busy={interact.isPending} onRun={run} />
            ))}
          </ul>
        </section>
      )}
      {!rel.alive && <p className="rounded-card bg-paper-2 p-3 text-sm text-text-soft">Gone, but never forgotten. May their memory be a blessing.</p>}
    </div>
  );
}

function Meter({ label, value, tone, hint }: { readonly label: string; readonly value: number; readonly tone: string; readonly hint: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <p className="flex items-baseline justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span className="tabular font-bold">{pct}/100</span>
      </p>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-1 h-2.5 overflow-hidden rounded-full bg-paper-3">
        <div className={`h-full rounded-full ${tone} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-0.5 text-2xs text-text-faint">{hint}</p>
    </div>
  );
}

function CoupleStatus({ rel, now }: { readonly rel: RelationshipDto; readonly now: number }) {
  const days = rel.datingSince === null ? null : Math.max(0, Math.floor((now - rel.datingSince) / MINUTES_PER_DAY));
  const steps = [
    { label: 'Introduction', done: rel.introductionDone },
    { label: 'Traditional wedding', done: rel.traditionalWeddingDone },
    { label: 'White wedding', done: rel.whiteWeddingDone },
  ];
  return (
    <section aria-label="Your relationship" className="rounded-card bg-ankara-soft p-3">
      <p className="flex items-center gap-1.5 font-bold text-ankara">
        <Heart size={16} aria-hidden className="fill-current" />
        {rel.kind === 'spouse' ? 'Married' : rel.kind === 'fiance' ? 'Engaged' : 'Dating'}
        {days !== null && rel.kind === 'partner' ? ` for ${days} day${days === 1 ? '' : 's'}` : ''}
      </p>
      {rel.kind !== 'partner' && (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-2">
              {step.done ? <Check size={16} aria-hidden className="text-naira" /> : <Circle size={14} aria-hidden className="text-text-faint" />}
              <span className={step.done ? 'font-bold' : 'text-text-soft'}>{step.label}</span>
              <span className="sr-only">{step.done ? 'done' : 'not yet'}</span>
            </li>
          ))}
        </ul>
      )}
      {rel.expectingAt !== null && <p className="mt-2 text-sm font-bold">Baby on the way — due {formatDate(rel.expectingAt)}</p>}
    </section>
  );
}
