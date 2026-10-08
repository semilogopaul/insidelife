'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect } from 'react';
import { queryKeys } from '@/common/api/query-keys';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { momentFromServer, useCelebrations } from '../hooks/use-celebration-store';
import { badgeFromNotification } from '../services/badge-from-notification';
import { celebrationsApi } from '../services/progression.api';
import { BadgeBurst } from './BadgeBurst';
import { MilestoneMoment } from './MilestoneMoment';

let localSeq = 0;

/**
 * Milestone moments (first salary, admission, wedding…) full-screen, one at a time, plus toast-level bursts for
 * achievements and Life Goals. Sources: pending milestones on load, `progression:milestone` pushes, `achievement`
 * notifications and the `celebrate` game event. Server moments are acknowledged when closed.
 */
export function CelebrationLayer() {
  const client = useQueryClient();
  const hasCharacter = useSnapshot().data !== undefined;
  const moments = useCelebrations((state) => state.moments);
  const enqueueMoment = useCelebrations((state) => state.enqueueMoment);
  const dismissMoment = useCelebrations((state) => state.dismissMoment);
  const enqueueBadge = useCelebrations((state) => state.enqueueBadge);
  const runTotal = useCelebrations((state) => state.runTotal);

  const pending = useQuery({
    queryKey: queryKeys.domain('celebrations', 'pending'),
    queryFn: celebrationsApi.pendingMilestones,
    enabled: hasCharacter,
    staleTime: Number.POSITIVE_INFINITY,
  });
  useEffect(() => {
    for (const dto of pending.data ?? []) enqueueMoment(momentFromServer(dto));
  }, [pending.data, enqueueMoment]);

  useRealtimeEvent('progression:milestone', (dto) => enqueueMoment(momentFromServer(dto)));
  useRealtimeEvent('notification', (notification) => {
    const badge = badgeFromNotification(notification);
    if (!badge) return;
    enqueueBadge(badge);
    void client.invalidateQueries({ queryKey: queryKeys.domain('progression') });
  });

  useEffect(() => {
    const off = gameEvents.on('celebrate', (event) => {
      localSeq += 1;
      const key = `local:${localSeq}:${event.title}`;
      if (event.kind === 'milestone') {
        enqueueMoment({ key, serverId: null, title: event.title, body: event.body ?? '', icon: 'sparkles', shareText: `${event.title} — Inside Life`, stats: [] });
      } else {
        enqueueBadge({ key, kind: event.kind, title: event.title, body: event.body ?? null });
      }
    });
    return () => {
      off();
    };
  }, [enqueueMoment, enqueueBadge]);

  const acknowledge = useMutation({ mutationFn: celebrationsApi.acknowledge });
  const current = moments[0] ?? null;

  const index = runTotal - moments.length + 1;

  useEffect(() => {
    if (current) gameEvents.emit('sfx', { id: 'celebration' });
  }, [current]);

  const close = useCallback(() => {
    if (!current) return;
    if (current.serverId) {
      acknowledge.mutate(current.serverId, {
        onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.domain('progression') }),
      });
    }
    dismissMoment(current.key);
  }, [current, acknowledge, dismissMoment, client]);

  return (
    <>
      <AnimatePresence mode="wait">
        {current && <MilestoneMoment key={current.key} moment={current} index={index} total={runTotal} onClose={close} />}
      </AnimatePresence>
      <BadgeBurst />
    </>
  );
}
