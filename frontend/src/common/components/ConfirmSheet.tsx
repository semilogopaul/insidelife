'use client';

import type { ReactNode } from 'react';
import { Button } from './Button';
import { Sheet } from './Sheet';

export interface ConfirmSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone?: 'danger' | 'danfo';
  readonly loading?: boolean;
  readonly onConfirm: () => void;
}

/** "Are you sure?" for consequential, non-money-sending actions (resign, sell, close). */
export function ConfirmSheet({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Not now',
  tone = 'danger',
  loading,
  onConfirm,
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description} size="sm">
      <div className="flex flex-col gap-4 pb-1">
        {children}
        <div className="flex flex-col gap-2">
          <Button variant={tone} size="lg" block loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="paper" block onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
