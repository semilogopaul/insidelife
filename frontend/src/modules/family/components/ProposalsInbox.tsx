'use client';

import { Gem, Heart, Inbox, UserPlus } from 'lucide-react';
import type { ProposalDto, ProposalKind } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Badge, Button, EmptyState, Money, Section, Spinner, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useProposals, useRespondProposal } from '../hooks/use-family';

const KIND: Readonly<Record<ProposalKind, { readonly label: string; readonly icon: typeof Heart }>> = {
  friend: { label: 'wants to be friends', icon: UserPlus },
  date: { label: 'is asking you out', icon: Heart },
  marriage: { label: 'is proposing to you!', icon: Gem },
  baby: { label: 'wants to try for a baby', icon: Heart },
};

const STATUS_TONE = { pending: 'warn', accepted: 'good', declined: 'bad', cancelled: 'neutral' } as const;

/** Requests from real players (dates, marriage, babies) — accept or decline — and the ones you sent. */
export function ProposalsInbox() {
  const proposals = useProposals();
  const respond = useRespondProposal();
  if (proposals.isPending) {
    return (
      <div className="grid place-items-center py-12 text-text-soft">
        <Spinner />
      </div>
    );
  }
  if (proposals.isError) return <p className="py-8 text-center text-sm text-okada">{errorMessage(proposals.error)}</p>;
  const incoming = proposals.data.incoming.filter((proposal) => proposal.status === 'pending');
  const outgoing = proposals.data.outgoing;
  if (incoming.length === 0 && outgoing.length === 0) {
    return <EmptyState icon={Inbox} title="No requests" body="When a player asks you out or proposes, it lands here. Ask someone yourself from their profile in Gist." />;
  }

  const answer = (proposal: ProposalDto, accept: boolean): void =>
    respond.mutate(
      { id: proposal.id, accept },
      {
        onSuccess: () => {
          gameEvents.emit('sfx', { id: accept ? 'ui-success' : 'ui-click' });
          if (accept && proposal.kind === 'marriage') gameEvents.emit('celebrate', { kind: 'milestone', title: 'Engaged!', body: `You said yes to ${proposal.from.name}.` });
          else toast({ title: accept ? 'Accepted' : 'Declined', body: accept ? `You and ${proposal.from.name} — let’s see where this goes.` : 'No hard feelings.', tone: accept ? 'good' : 'neutral' });
        },
        onError: (error) => toast({ title: 'Couldn’t answer that', body: errorMessage(error), tone: 'bad' }),
      },
    );

  return (
    <div className="flex flex-col gap-5">
      {incoming.length > 0 && (
        <Section title="For you" aside={`${incoming.length}`}>
          <ul className="flex flex-col gap-2">
            {incoming.map((proposal) => {
              const kind = KIND[proposal.kind];
              const Icon = kind.icon;
              return (
                <li key={proposal.id} className="flex flex-col gap-2.5 rounded-card bg-ankara-soft p-3.5">
                  <p className="flex items-start gap-2.5">
                    <Icon size={20} aria-hidden className="mt-0.5 shrink-0 text-ankara" />
                    <span>
                      <span className="font-bold">{proposal.from.name}</span> <span className="text-text-soft">@{proposal.from.handle}</span> {kind.label}
                    </span>
                  </p>
                  {proposal.message && <p className="rounded-chip bg-paper px-3 py-2 text-sm italic">“{proposal.message}”</p>}
                  {proposal.ringValue > 0 && (
                    <p className="text-sm font-bold">
                      Ring: <Money amount={proposal.ringValue} />
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="paper" disabled={respond.isPending} onClick={() => answer(proposal, false)}>
                      Decline
                    </Button>
                    <Button disabled={respond.isPending} onClick={() => answer(proposal, true)}>
                      Accept
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {outgoing.length > 0 && (
        <Section title="You asked">
          <ul className="flex flex-col gap-1.5">
            {outgoing.map((proposal) => (
              <li key={proposal.id} className="flex items-center justify-between gap-3 rounded-card bg-paper-2 px-3 py-2.5">
                <span className="min-w-0 text-sm">
                  <span className="font-bold">{proposal.to.name}</span> — {proposal.kind === 'marriage' ? 'marriage proposal' : proposal.kind === 'date' ? 'date' : proposal.kind}
                </span>
                <Badge tone={STATUS_TONE[proposal.status]}>{proposal.status === 'pending' ? 'Waiting' : proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
