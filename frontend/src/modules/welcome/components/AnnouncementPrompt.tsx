'use client';

import type { Announcement } from '@insidelife/shared';
import { Button, JetHero, Sheet } from '@/common/components';
import { useUi, type PhoneApp } from '@/common/game/ui-store';

/**
 * A "What's new" announcement, shown once per account. Closing it or tapping any button records it as seen (on the
 * server); the buttons then open the phone app they name.
 */
export function AnnouncementPrompt({ open, announcement, onSeen }: { readonly open: boolean; readonly announcement: Announcement; readonly onSeen: () => void }) {
  const openPhone = useUi((state) => state.openPhone);
  const go = (app: string, param?: string): void => {
    onSeen();
    openPhone(app as PhoneApp, param ?? null);
  };
  const [primary, ...others] = announcement.actions;
  return (
    <Sheet open={open} onClose={onSeen} title={announcement.title} description="New in Inside Life" size="sm">
      <div className="flex flex-col gap-4 pb-2">
        <JetHero className="h-36 rounded-card" label="A private jet climbing away from the Lagos skyline toward Abuja" />
        {announcement.body.map((paragraph) => (
          <p key={paragraph} className="text-base leading-relaxed">
            {paragraph}
          </p>
        ))}
        <div className="grid gap-2 sm:grid-cols-2">
          {primary && (
            <Button className="sm:col-span-2" onClick={() => go(primary.app, primary.param)}>
              {primary.label}
            </Button>
          )}
          {others.map((action) => (
            <Button key={action.label} variant="paper" onClick={() => go(action.app, action.param)}>
              {action.label}
            </Button>
          ))}
        </div>
        <Button variant="ghost" className="text-text-soft" onClick={onSeen}>
          Maybe later
        </Button>
      </div>
    </Sheet>
  );
}
