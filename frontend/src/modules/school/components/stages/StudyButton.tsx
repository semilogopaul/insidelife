'use client';

import { BookOpen } from 'lucide-react';
import { Button } from '@/common/components';
import { useCurrentPlace } from '@/common/hooks/use-current-place';
import { useStudy } from '../../hooks/use-education';
import { announce, complain } from '@/common/game/feedback';

const STUDY_MINUTES = 120;

/** "Study 2h" when you're home or on campus and free; otherwise says where studying works. */
export function StudyButton({ tone = 'paper' }: { readonly tone?: 'paper' | 'ink' }) {
  const place = useCurrentPlace();
  const study = useStudy();
  const canStudyHere = place.atHome || place.venue?.type === 'campus';
  if (!canStudyHere) {
    return (
      <p className={tone === 'ink' ? 'text-sm text-on-ink-soft' : 'text-sm text-text-soft'}>
        Study at home or on campus — every hour counts.
      </p>
    );
  }
  return (
    <Button
      variant={tone === 'ink' ? 'danfo' : 'ink'}
      icon={<BookOpen size={17} aria-hidden />}
      disabled={place.busyWith !== null}
      loading={study.isPending}
      onClick={() =>
        study.mutate(STUDY_MINUTES, {
          onSuccess: () => announce('Reading time', { body: '2 hours with your books. Phone face down!' }),
          onError: (error) => complain('Couldn’t start studying', error),
        })
      }
    >
      {place.busyWith ? `Busy: ${place.busyWith}` : 'Study for 2 hours'}
    </Button>
  );
}
