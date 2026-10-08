import { NotebookPen } from 'lucide-react';
import type { GameMinute, MedicalRecordDto, MedicalRecordKind } from '@insidelife/shared';
import { EmptyState, Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { gameDateTime } from '@/common/utils/game-time';

const KIND_DOT: Partial<Record<MedicalRecordKind, string>> = {
  onset: 'bg-okada',
  diagnosis: 'bg-danfo',
  'treatment-failed': 'bg-okada',
  recovery: 'bg-naira',
  discharge: 'bg-naira',
  birth: 'bg-ankara',
  pregnancy: 'bg-ankara',
  antenatal: 'bg-ankara',
  death: 'bg-ink',
};

const KIND_LABEL: Record<MedicalRecordKind, string> = {
  onset: 'Fell ill',
  diagnosis: 'Diagnosis',
  treatment: 'Treatment',
  'treatment-failed': 'Treatment failed',
  admission: 'Admitted',
  discharge: 'Discharged',
  recovery: 'Recovered',
  'check-up': 'Check-up',
  medication: 'Medication',
  pregnancy: 'Pregnancy',
  antenatal: 'Antenatal',
  birth: 'Birth',
  insurance: 'HMO',
  death: 'Death',
};

/** Your medical file, newest first. */
export function HistoryTab({
  history,
  now,
}: {
  readonly history: readonly MedicalRecordDto[];
  readonly now: GameMinute;
}) {
  if (history.length === 0)
    return (
      <EmptyState icon={NotebookPen} title="Clean file" body="No hospital visits yet. Long may it last." />
    );
  const records = [...history].sort((a, b) => b.gameMinute - a.gameMinute);
  return (
    <ol className="flex flex-col">
      {records.map((record, index) => (
        <li key={record.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < records.length - 1 && (
            <span aria-hidden className="absolute left-1.25 top-4 h-full w-0.5 bg-line" />
          )}
          <span
            aria-hidden
            className={cn(
              'relative mt-1.5 size-3 shrink-0 rounded-full ring-2 ring-paper',
              KIND_DOT[record.kind] ?? 'bg-cobalt',
            )}
          />
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold">{KIND_LABEL[record.kind]}</span>
              {record.cost > 0 && <Money amount={-record.cost} className="shrink-0 text-xs font-bold" />}
            </div>
            <p>{record.summary}</p>
            <p className="text-xs text-text-soft">
              {gameDateTime(record.gameMinute, now)}
              {record.venueName && ` · ${record.venueName}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
