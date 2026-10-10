'use client';

import { Disc3, Upload } from 'lucide-react';
import { useState } from 'react';
import { PROMOTION_CONTENT_RULES } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, EmptyState, Section, Spinner, toast } from '@/common/components';
import { useSlots, useTracks } from '../../hooks/use-promote';
import { formatDuration } from '../../services/rules';
import { TrackCard } from './TrackCard';
import { TrackUploadForm } from './TrackUploadForm';

/** Upload a song, then book 7 days in every club's rotation and watch the plays come in. */
export function ClubDjTab({ onOpenOrder, initialOrdering = null }: { readonly onOpenOrder: (orderId: string) => void; readonly initialOrdering?: string | null }) {
  const tracks = useTracks();
  const slots = useSlots();
  const [ordering, setOrdering] = useState<string | null>(initialOrdering);
  const [uploading, setUploading] = useState(false);
  const offer = slots.data?.clubSong ?? null;

  const hasTracks = (tracks.data?.length ?? 0) > 0;
  const upload = (
    <TrackUploadForm
      priceKobo={offer?.weekPriceKobo}
      playsPerDay={offer?.playsPerDay}
      onCancel={hasTracks ? () => setUploading(false) : undefined}
      onUploaded={(track) => {
        toast({ title: 'Song uploaded', body: `${track.title} · ${formatDuration(track.durationSeconds)}. Now book where it plays.`, tone: 'good' });
        setUploading(false);
        setOrdering(track.id);
      }}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {!hasTracks && !tracks.isPending && upload}
      <Section
        title="My tracks"
        aside={
          hasTracks && !uploading ? (
            <Button size="sm" variant="paper" icon={<Upload size={16} aria-hidden />} onClick={() => setUploading(true)}>
              New song
            </Button>
          ) : null
        }
      >
        {hasTracks && uploading && upload}
        {tracks.isPending ? (
          <Spinner className="mx-auto my-6 block text-text-soft" />
        ) : tracks.isError ? (
          <div className="rounded-card bg-okada-soft p-4 text-sm">
            <p className="text-okada">{errorMessage(tracks.error)}</p>
            <Button variant="paper" size="sm" className="mt-2" onClick={() => void tracks.refetch()}>
              Try again
            </Button>
          </div>
        ) : !hasTracks ? (
          <EmptyState icon={Disc3} title="No songs yet" body="Upload your first track above. You only pay when you book club plays." />
        ) : (
          <ul className="flex flex-col gap-3">
            {tracks.data.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                offer={offer}
                rules={PROMOTION_CONTENT_RULES}
                ordering={ordering === track.id}
                onOrder={(open) => setOrdering(open ? track.id : null)}
                onOpenOrder={onOpenOrder}
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
