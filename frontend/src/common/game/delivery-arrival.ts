'use client';

import { useEffect, useRef } from 'react';
import { findAction, homeLocationId, needsAlongTimeline, type CharacterSnapshotDto } from '@insidelife/shared';
import { toast } from '@/common/components';
import { gameClock } from './game-clock';
import { gameEvents } from './game-events';
import { useSnapshot } from './snapshot';

export interface DeliveryArrival {
  /** Stable per run, so it fires once. */
  readonly key: string;
  readonly actionId: string;
  readonly service: string;
  readonly items: string;
  readonly endsAt: number;
  readonly atHome: boolean;
  readonly hungerBefore: number;
  readonly hungerAfter: number;
}

/** The delivery the player is waiting on (their current explicit delivery-style action), with its hunger effect. */
export function pendingDelivery(snapshot: CharacterSnapshotDto): DeliveryArrival | null {
  const segment = snapshot.timeline[0];
  if (!segment || segment.kind !== 'action' || !segment.explicit || !segment.actionId) return null;
  const delivery = findAction(segment.actionId)?.delivery;
  if (!delivery) return null;
  const project = (t: number): number => needsAlongTimeline(snapshot.character.needs, snapshot.asOf, snapshot.timeline, t).hunger;
  return {
    key: `${snapshot.character.id}:${segment.actionId}:${segment.endsAt}`,
    actionId: segment.actionId,
    service: delivery.service,
    items: delivery.items,
    endsAt: segment.endsAt,
    atHome: segment.locationId === homeLocationId(snapshot.character.id),
    hungerBefore: project(Math.max(segment.startsAt, snapshot.asOf)),
    hungerAfter: project(segment.endsAt),
  };
}

/** "Your Chowdeck order arrived: hot jollof rice and chicken" with the hunger effect. */
export function deliveryToast(arrival: DeliveryArrival): { title: string; body: string } {
  const before = Math.round(arrival.hungerBefore);
  const after = Math.round(arrival.hungerAfter);
  const effect = after > before ? `Hunger ${before}% → ${after}%.` : `Hunger ${after}%.`;
  return {
    title: `Your ${arrival.service} order arrived: ${arrival.items}`,
    body: arrival.atHome ? `${effect} It’s on your table at home.` : effect,
  };
}

/** Announces a delivery the moment its time is up (toast, hunger effect, sound, and an event the world can stage). */
export function useDeliveryArrival(): void {
  const { data } = useSnapshot();
  const pending = useRef<DeliveryArrival | null>(null);
  const announced = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const next = pendingDelivery(data);
    if (!next || next.key === announced.current || next.key === pending.current?.key) return;
    pending.current = next;
    if (timer.current !== null) window.clearTimeout(timer.current);
    const fire = (): void => {
      const arrival = pending.current;
      timer.current = null;
      if (!arrival || announced.current === arrival.key) return;
      announced.current = arrival.key;
      const { title, body } = deliveryToast(arrival);
      toast({ title, body, tone: 'good' });
      gameEvents.emit('sfx', { id: 'eat' });
      gameEvents.emit('delivery-arrived', { actionId: arrival.actionId, items: arrival.items, atHome: arrival.atHome });
    };
    const wait = gameClock.ready ? gameClock.localMsAt(next.endsAt) - Date.now() : 0;
    timer.current = window.setTimeout(fire, Math.max(0, wait));
  }, [data]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
}
