'use client';

import { WELCOME_NOTE, type WelcomeReaction } from '@insidelife/shared';
import { Button, Sheet } from '@/common/components';

/** The warm note from the team a new player sees once. Either button closes it and records the choice. */
export function WelcomeNote({ open, onAnswer }: { readonly open: boolean; readonly onAnswer: (reaction: WelcomeReaction) => void }) {
  const [primary, secondary] = WELCOME_NOTE.reactions;
  return (
    <Sheet open={open} onClose={() => undefined} title={WELCOME_NOTE.title} dismissible={false} size="sm">
      <div className="flex flex-col gap-4 pb-1">
        <p className="text-base leading-relaxed">{WELCOME_NOTE.body}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="ink" onClick={() => onAnswer(primary.id)}>
            {primary.label}
          </Button>
          <Button variant="paper" onClick={() => onAnswer(secondary.id)}>
            {secondary.label}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
