'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { DoorOpen, HandHeart, House, Navigation, UtensilsCrossed, X } from 'lucide-react';
import type { VisitDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useSnapshot } from '@/common/game/snapshot';
import { useVisitActions, useVisits } from '@/common/visits';
import { useThankHost } from '../hooks/use-hosting';
import { HostSheet } from './HostSheet';

/** Treats a guest hasn't said thanks for yet. */
const unthanked = (visit: VisitDto) => visit.treats.filter((treat) => !treat.thanked);

/**
 * Home visits on the HUD: an invite to answer, the place you're expected (with GPS to the door), who's coming to
 * yours (with "see them out" and, once they're in, "Host" to treat them), or a treat to say thanks for. At most two
 * cards; nothing when there's nothing to do.
 */
export function VisitCards() {
  const { data: snapshot } = useSnapshot();
  const { data } = useVisits(snapshot !== undefined);
  const [hosting, setHosting] = useState(false);
  if (!snapshot || !data) return null;
  const here = snapshot.character.locationId;
  const cards: VisitDto[] = [
    ...data.incoming.filter((visit) => visit.status === 'invited'),
    // Expected somewhere and not there yet.
    ...data.incoming.filter((visit) => visit.status === 'accepted' && here !== visit.home.locationId),
    // Inside, and the host treated you.
    ...data.incoming.filter(
      (visit) => visit.status === 'accepted' && here === visit.home.locationId && unthanked(visit).length > 0,
    ),
    // Guests coming, or in your house.
    ...data.outgoing.filter((visit) => visit.status === 'accepted'),
  ];
  if (cards.length === 0) return null;
  return (
    <>
      {cards.slice(0, 2).map((visit) => (
        <VisitCard key={visit.id} visit={visit} onHost={() => setHosting(true)} />
      ))}
      <HostSheet open={hosting} onClose={() => setHosting(false)} />
    </>
  );
}

function VisitCard({ visit, onHost }: { readonly visit: VisitDto; readonly onHost: () => void }) {
  const reduceMotion = useReducedMotion();
  const actions = useVisitActions();
  const thank = useThankHost();
  const setDestination = useNavigation((state) => state.setDestination);
  const busy = actions.accept.isPending || actions.decline.isPending || actions.end.isPending;
  const fail = (title: string) => (error: unknown) => {
    gameEvents.emit('sfx', { id: 'ui-error' });
    toast({ title, body: errorMessage(error), tone: 'bad' });
  };
  const place = `${visit.host.firstName}’s place`;
  const directions = (): void => {
    setDestination(visit.home.locationId, place);
    gameEvents.emit('sfx', { id: 'ui-success' });
  };

  let title: string;
  let body: string;
  let buttons: ReactNode;
  if (visit.role === 'guest' && visit.status === 'invited') {
    title = `@${visit.host.handle} invited you over`;
    body = `${place} — ${visit.home.label}.`;
    buttons = (
      <>
        <Button
          size="sm"
          variant="ink"
          icon={<House size={15} aria-hidden />}
          disabled={busy}
          onClick={() =>
            actions.accept.mutate(visit.id, {
              onSuccess: () => {
                directions();
                toast({
                  title: `On your way to ${place}`,
                  body: 'Follow the GPS to their gate, or book a ride from the Map.',
                  tone: 'good',
                });
              },
              onError: fail('Couldn’t accept'),
            })
          }
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="paper"
          disabled={busy}
          onClick={() => actions.decline.mutate(visit.id, { onError: fail('Couldn’t decline') })}
        >
          Not now
        </Button>
      </>
    );
  } else if (visit.role === 'guest' && unthanked(visit).length > 0) {
    const treats = unthanked(visit);
    title = `${visit.host.firstName} treated you ${treats[0]?.emoji ?? ''}`.trim();
    body = treats.map((treat) => treat.name).join(', ') + '. A thank-you is free.';
    buttons = (
      <Button
        size="sm"
        variant="ink"
        icon={<HandHeart size={15} aria-hidden />}
        disabled={thank.isPending}
        onClick={() =>
          thank.mutate(visit.id, {
            onSuccess: () => {
              gameEvents.emit('sfx', { id: 'ui-success' });
              toast({
                title: `You thanked ${visit.host.firstName}`,
                body: 'Good manners cost nothing.',
                tone: 'good',
              });
            },
            onError: fail('Couldn’t say thanks'),
          })
        }
      >
        Say thanks
      </Button>
    );
  } else if (visit.role === 'guest') {
    title = `${visit.host.firstName} is expecting you`;
    body = `${visit.home.label}. Walk up to their gate to go in.`;
    buttons = (
      <>
        <Button size="sm" variant="ink" icon={<Navigation size={15} aria-hidden />} onClick={directions}>
          Directions
        </Button>
        <Button
          size="sm"
          variant="paper"
          disabled={busy}
          onClick={() => actions.end.mutate(visit.id, { onError: fail('Couldn’t cancel') })}
        >
          Can’t make it
        </Button>
      </>
    );
  } else {
    title = visit.guestInside
      ? `${visit.guest.firstName} is at your place`
      : `${visit.guest.firstName} is coming over`;
    const thanks = visit.treats.filter((treat) => treat.thanked).length;
    body = visit.guestInside
      ? thanks > 0
        ? `${visit.guest.firstName} said thanks for the ${visit.treats.find((treat) => treat.thanked)?.name.toLowerCase() ?? 'treat'}.`
        : 'Hang out together — or treat them to something.'
      : `@${visit.guest.handle} accepted your invite.`;
    buttons = (
      <>
        {visit.guestInside && (
          <Button size="sm" variant="ink" icon={<UtensilsCrossed size={15} aria-hidden />} onClick={onHost}>
            Host
          </Button>
        )}
        <Button
          size="sm"
          variant="paper"
          icon={visit.guestInside ? <DoorOpen size={15} aria-hidden /> : <X size={15} aria-hidden />}
          disabled={busy}
          onClick={() =>
            actions.end.mutate(visit.id, {
              onSuccess: () =>
                toast({
                  title: visit.guestInside ? `You saw ${visit.guest.firstName} out` : 'Visit cancelled',
                  tone: 'neutral',
                }),
              onError: fail('Couldn’t end the visit'),
            })
          }
        >
          {visit.guestInside ? 'See them out' : 'Cancel visit'}
        </Button>
      </>
    );
  }

  return (
    <motion.section
      aria-label="Home visit"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-card bg-paper text-ink shadow-[var(--shadow-glass)]"
    >
      <div className="flex items-start gap-3 px-3.5 pb-3 pt-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danfo text-ink">
          <House size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-title text-lg leading-tight">{title}</p>
          <p className="mt-0.5 text-sm text-text-soft">{body}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">{buttons}</div>
        </div>
      </div>
    </motion.section>
  );
}
