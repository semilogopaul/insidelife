'use client';

import { Laptop } from 'lucide-react';
import { Button } from '@/common/components';
import { useSnapshot, useSnapshotMutation } from '@/common/game/snapshot';
import { useCurrentPlace } from '@/common/hooks/use-current-place';
import { useInventoryTags } from '../../hooks/use-jobs-data';
import { announce, complain } from '@/common/game/feedback';
import { jobsApi } from '../../services/jobs.api';

const FREELANCE_MIN_TECH = 20;
const GIG_MINUTES = 120;

/** Laptop + tech skill = side income: start a freelance gig from home (or any office). */
export function FreelanceHint() {
  const { data: snapshot } = useSnapshot();
  const tags = useInventoryTags();
  const place = useCurrentPlace();
  const start = useSnapshotMutation(() => jobsApi.startAction('freelance', GIG_MINUTES));
  const tech = snapshot?.character.skills.tech ?? 0;
  if (!tags.data?.includes('laptop') || tech < FREELANCE_MIN_TECH) return null;

  const canWorkHere = place.atHome || place.venue?.type === 'office';
  return (
    <aside className="flex items-start gap-3 rounded-card bg-cobalt-soft p-3.5 text-sm">
      <Laptop size={22} aria-hidden className="mt-0.5 shrink-0 text-cobalt" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">Freelance on the side</p>
        <p className="text-text-soft">
          You have a laptop and Tech {Math.floor(tech)}. Fix websites for naira — pay rises with your tech
          skill.
        </p>
        {canWorkHere ? (
          <Button
            size="sm"
            variant="ink"
            className="mt-2.5"
            disabled={place.busyWith !== null}
            loading={start.isPending}
            onClick={() =>
              start.mutate(undefined, {
                onSuccess: () =>
                  announce('Gig started', { body: '2 hours of client work. Payment lands when you finish.' }),
                onError: (error) => complain('Couldn’t start the gig', error),
              })
            }
          >
            Start a 2-hour gig
          </Button>
        ) : (
          <p className="mt-1.5 text-xs font-bold text-cobalt">Gigs run from home or any office.</p>
        )}
      </div>
    </aside>
  );
}
