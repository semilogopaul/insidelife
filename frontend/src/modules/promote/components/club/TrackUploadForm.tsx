'use client';

import { FileAudio, Music } from 'lucide-react';
import { useId, useState } from 'react';
import {
  ARTIST_NAME_MAX,
  CLUB_PLAY_PRODUCT,
  PROMOTION_TITLE_MAX,
  TRACK_ACCEPTED_TYPES,
  TRACK_MAX_BYTES,
  TRACK_MAX_SECONDS,
  TRACK_MIN_SECONDS,
  formatNaira,
  koboToNaira,
  type ClubTrackDto,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, TextField } from '@/common/components';
import { usePickedFile } from '../../hooks/use-picked-file';
import { useTrackUpload } from '../../hooks/use-promote';
import { checkTrackFile, formatDuration, trackDurationProblem, validateDisplayText } from '../../services/rules';
import { UploadProgress } from '../shared';

/** Artist, title and an MP3/OGG (30 s to under 5 min). Listen before you upload; the server measures the real length. */
export interface TrackUploadFormProps {
  readonly onUploaded: (track: ClubTrackDto) => void;
  readonly onCancel?: () => void;
  /** Today's price per song (the catalog default until the server's is known). */
  readonly priceKobo?: number;
  /** Plays a day every song gets (from the offer), for the copy. */
  readonly playsPerDay?: number;
}

export function TrackUploadForm({ onUploaded, onCancel, priceKobo = CLUB_PLAY_PRODUCT.priceKobo, playsPerDay }: TrackUploadFormProps) {
  const inputId = useId();
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = usePickedFile();
  const [duration, setDuration] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const file = picked?.file ?? null;
  const upload = useTrackUpload();
  const artistCheck = validateDisplayText(artist, 'Artist name', 2, ARTIST_NAME_MAX);
  const titleCheck = validateDisplayText(title, 'Song title', 1, PROMOTION_TITLE_MAX);
  const fileError = file ? checkTrackFile(file) : null;
  const durationError = trackDurationProblem(duration);
  const ready = artistCheck.ok && titleCheck.ok && file !== null && fileError === null && durationError === null;

  const submit = (): void => {
    setTouched(true);
    if (!ready || !artistCheck.ok || !titleCheck.ok || !file) return;
    upload.mutate(
      { artistName: artistCheck.value, title: titleCheck.value, file },
      {
        onSuccess: (track) => {
          setArtist('');
          setTitle('');
          setPicked(null);
          setDuration(null);
          setTouched(false);
          onUploaded(track);
        },
      },
    );
  };

  return (
    <section aria-label="Upload a song" className="flex flex-col gap-3 rounded-sheet bg-paper-2 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-ankara text-white">
          <Music size={20} aria-hidden />
        </span>
        <div>
          <h4 className="type-title text-lg leading-tight">Get your song played in the club</h4>
          <p className="text-xs text-text-soft">The DJs drop it between their own sets. Every play is counted.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <TextField label="Artist name" value={artist} maxLength={ARTIST_NAME_MAX} onChange={(event) => setArtist(event.target.value)} error={touched && !artistCheck.ok ? artistCheck.reason : null} />
        <TextField label="Song title" value={title} maxLength={PROMOTION_TITLE_MAX} onChange={(event) => setTitle(event.target.value)} error={touched && !titleCheck.ok ? titleCheck.reason : null} />
      </div>
      <div>
        <input id={inputId} type="file" accept={[...TRACK_ACCEPTED_TYPES, '.mp3', '.ogg'].join(',')} className="peer sr-only" onChange={(event) => {
            setDuration(null);
            setPicked(event.target.files?.[0] ?? null);
          }} />
        <label
          htmlFor={inputId}
          className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-paper font-bold hover:bg-paper-3 peer-focus-visible:outline-3 peer-focus-visible:outline-danfo"
        >
          <FileAudio size={18} aria-hidden />
          {file ? 'Choose a different song' : 'Choose an MP3 or OGG'}
        </label>
        <p className="mt-1 text-xs text-text-soft">
          MP3 or OGG, up to {TRACK_MAX_BYTES / 1024 / 1024} MB, from {TRACK_MIN_SECONDS} seconds to <strong>up to {TRACK_MAX_SECONDS / 60} minutes</strong>. {formatNaira(Math.round(koboToNaira(priceKobo) / CLUB_PLAY_PRODUCT.days))} a day, sold by the week ({formatNaira(koboToNaira(priceKobo))}), plays it in every club and lounge{playsPerDay ? `, about ${playsPerDay} times a day` : ''}.
        </p>
      </div>
      {picked && (
        <div className="flex flex-col gap-1.5">
          <p className="truncate text-sm">
            <span className="font-bold">{picked.file.name}</span>
            {duration !== null && <span className="text-text-soft"> · {formatDuration(duration)}</span>}
          </p>
          <audio
            controls
            preload="metadata"
            src={picked.url}
            onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null)}
            className="h-10 w-full"
          >
            <track kind="captions" />
          </audio>
        </div>
      )}
      {(fileError || durationError) && <p className="text-sm font-bold text-okada">{fileError ?? durationError}</p>}
      {upload.isPending && <UploadProgress ratio={upload.progress} label="Uploading song" />}
      {upload.isError && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(upload.error)}
        </p>
      )}
      <Button size="lg" block disabled={file === null} loading={upload.isPending} onClick={submit}>
        {upload.isPending ? `Uploading… ${Math.round(upload.progress * 100)}%` : 'Upload song'}
      </Button>
      {onCancel && !upload.isPending && (
        <button type="button" onClick={onCancel} className="self-center text-sm font-bold text-text-soft underline-offset-2 hover:underline">
          Not now
        </button>
      )}
    </section>
  );
}
