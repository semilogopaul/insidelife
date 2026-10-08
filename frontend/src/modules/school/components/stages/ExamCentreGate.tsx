'use client';

import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { useExamCentre } from '../../hooks/use-exam-centre';
import { GoThere } from '@/common/components';

/**
 * Exam registration happens in person. Inside an open CBT centre → render the action; otherwise say where to go
 * and offer directions or a ride to the closest centre.
 */
export function ExamCentreGate({
  children,
  venueId,
}: {
  readonly children: ReactNode;
  readonly venueId?: string;
}) {
  const centre = useExamCentre();
  const required = venueId ? (centre.all.find((venue) => venue.id === venueId) ?? null) : null;
  const here = required ? (centre.here?.id === required.id ? centre.here : null) : centre.here;

  if (here && centre.open) return <>{children}</>;
  if (here && !centre.open) {
    return (
      <p className="rounded-card bg-danfo-soft p-3 text-sm font-bold">
        {here.name} is closed now. It opens 7am – 6pm (papers start by 3pm).
      </p>
    );
  }
  const target = required ?? centre.nearest;
  if (!target) return null;
  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-paper-2 p-3.5">
      <p className="flex items-start gap-2 text-sm">
        <MapPin size={17} aria-hidden className="mt-0.5 shrink-0 text-okada" />
        <span>
          {required ? (
            <>
              Your paper is at <strong>{required.name}</strong>. Get there between 7am and 3pm.
            </>
          ) : (
            <>
              JAMB and GCE are done in person at a CBT centre. Closest: <strong>{target.name}</strong>.
            </>
          )}
        </span>
      </p>
      <GoThere venueId={target.id} venueName={target.name} />
    </div>
  );
}
