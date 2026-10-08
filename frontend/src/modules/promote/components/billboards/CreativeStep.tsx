'use client';

import { CircleCheck, ImageUp, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { BILLBOARD_FORMAT_SPECS, CREATIVE_ACCEPTED_TYPES, type BillboardSlotDto, type CreativeDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { usePickedFile } from '../../hooks/use-picked-file';
import { useCreativeUpload } from '../../hooks/use-promote';
import { checkImageFile, cropReport, minimumImageSize } from '../../services/rules';
import { UploadProgress } from '../shared';

export interface CreativeStepProps {
  readonly slot: BillboardSlotDto;
  readonly creative: CreativeDto | null;
  readonly onUploaded: (creative: CreativeDto | null) => void;
  readonly onNext: () => void;
}

/**
 * Pick an image → see it cropped to the board's exact shape (centre cover crop, like the server) → upload → see the
 * re-encoded result the city will show.
 */
export function CreativeStep({ slot, creative, onUploaded, onNext }: CreativeStepProps) {
  const inputId = useId();
  const [picked, setPicked] = usePickedFile();
  const [size, setSize] = useState<{ readonly width: number; readonly height: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const file = picked?.file ?? null;
  const upload = useCreativeUpload();
  const spec = BILLBOARD_FORMAT_SPECS[slot.format];
  const min = minimumImageSize(slot.format);
  const report = size ? cropReport(size.width, size.height, slot.format) : null;
  const shown = creative?.url ?? picked?.url ?? null;

  const pick = (next: File | null): void => {
    upload.reset();
    onUploaded(null);
    setSize(null);
    setPicked(next);
    setFileError(next ? checkImageFile(next) : null);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-soft">
        This board is <strong className="text-text">{spec.label.toLowerCase()} {spec.aspect}</strong>. Upload{' '}
        <strong className="text-text">
          {spec.width} × {spec.height} px
        </strong>{' '}
        for the sharpest result (at least {min.width} × {min.height}). PNG, JPEG or WebP, up to 4 MB.
      </p>

      <div
        className={cn('relative overflow-hidden rounded-card bg-ink ring-1 ring-line', !shown && 'grid place-items-center')}
        style={{ aspectRatio: `${slot.width} / ${slot.height}`, maxHeight: slot.format === 'portrait' ? 360 : undefined, marginInline: slot.format === 'portrait' ? 'auto' : undefined }}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URLs and media-server URLs; no optimisation wanted
          <img
            src={shown}
            alt={creative ? 'Your billboard as it will appear' : 'Preview of your image cropped to the board'}
            onLoad={(event) => {
              if (!creative) setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
            }}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 p-4 text-center text-on-ink-soft">
            <ImageUp size={26} aria-hidden />
            <span className="text-sm">
              {spec.aspect} preview
            </span>
          </span>
        )}
        {creative && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-chip bg-naira px-2 py-0.5 text-2xs font-bold text-white">
            <CircleCheck size={12} aria-hidden /> Uploaded
          </span>
        )}
      </div>

      {creative ? (
        <p className="text-sm text-text-soft">
          Saved at {creative.width} × {creative.height}. This is exactly what drivers will see. Each ad shows for 10 seconds in turn with up to {slot.maxConcurrentAds - 1} others.
        </p>
      ) : report ? (
        <p className={cn('flex gap-2 text-sm', report.tooSmall ? 'font-bold text-okada' : 'text-text-soft')}>
          {report.tooSmall && <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />}
          {report.tooSmall
            ? `Your image is ${size?.width} × ${size?.height}: too small for this board. Use at least ${min.width} × ${min.height}.`
            : report.trims === 'none'
              ? `Your image is ${size?.width} × ${size?.height}: a perfect fit.`
              : `Your image is ${size?.width} × ${size?.height}. We’ll trim the ${report.trims === 'sides' ? 'left and right edges' : 'top and bottom'} to fit ${spec.aspect} (keeping ${Math.round(report.kept * 100)}%), as shown.`}
        </p>
      ) : null}

      <div>
        <input
          id={inputId}
          type="file"
          accept={CREATIVE_ACCEPTED_TYPES.join(',')}
          className="peer sr-only"
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
        />
        <label
          htmlFor={inputId}
          className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-paper font-bold hover:bg-paper-2 peer-focus-visible:outline-3 peer-focus-visible:outline-danfo"
        >
          <ImageUp size={18} aria-hidden />
          {file ? 'Choose a different image' : 'Choose an image'}
        </label>
        {fileError && <p className="mt-1.5 text-sm font-bold text-okada">{fileError}</p>}
      </div>

      {upload.isPending && <UploadProgress ratio={upload.progress} label="Uploading image" />}
      {upload.isError && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(upload.error)}
        </p>
      )}

      {creative ? (
        <Button size="lg" block onClick={onNext}>
          Continue to dates
        </Button>
      ) : (
        <Button
          size="lg"
          block
          disabled={!file || fileError !== null || report?.tooSmall === true}
          loading={upload.isPending}
          onClick={() => file && upload.mutate({ slotId: slot.id, file }, { onSuccess: onUploaded })}
        >
          Upload image
        </Button>
      )}
    </div>
  );
}
