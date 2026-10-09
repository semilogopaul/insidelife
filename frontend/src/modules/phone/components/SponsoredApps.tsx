'use client';

import { ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LivePhoneAppDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { AppIcon } from '@/common/brand/app-icons';
import { Button, Sheet, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { adTrackingApi, safeExternalUrl } from '@/common/promotions/ad-tracking';
import { useLiveAds } from '@/common/promotions/use-live-ads';
import { site } from '@/config/site';

/**
 * Sponsored apps on the phone's home screen (real advertisers, booked in Promote). The shelf counts one impression per
 * app each time the home screen opens; a tap opens the app's page, and its button leaves the game only after the same
 * "you're leaving Inside Life" confirmation the billboards use. An empty shelf invites players to advertise.
 */
export function SponsoredShelf({ onOpen }: { readonly onOpen: (app: LivePhoneAppDto) => void }) {
  const { data } = useLiveAds();
  const apps = useMemo(() => data?.phoneApps ?? [], [data]);
  const counted = useRef<string>('');

  useEffect(() => {
    const key = apps.map((app) => app.campaignId).join(',');
    if (!key || counted.current === key) return;
    counted.current = key;
    adTrackingApi.impressions({ campaignIds: apps.map((app) => app.campaignId) }).catch(() => undefined);
  }, [apps]);

  return (
    <section aria-labelledby="sponsored-heading" className="mt-6">
      <h3 id="sponsored-heading" className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-text-faint">
        Sponsored
      </h3>
      {apps.length > 0 ? (
        <ul className="grid grid-cols-4 gap-x-3 gap-y-5">
          {apps.map((app) => (
            <li key={app.slotId}>
              <button
                type="button"
                onClick={() => {
                  gameEvents.emit('sfx', { id: 'ui-click' });
                  onOpen(app);
                }}
                className="flex w-full flex-col items-center gap-1.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- media-server icon, already sized by the server */}
                <img src={app.iconUrl} alt="" width={56} height={56} loading="lazy" className="size-14 rounded-[18px] bg-paper-2 object-cover shadow-[var(--shadow-lift)]" />
                <span className="line-clamp-1 max-w-full text-xs font-bold">{app.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => useUi.getState().openPhone('promote', 'app-1')}
          className="flex w-full items-center gap-3 rounded-card bg-paper-2 p-3 text-left ring-1 ring-dashed ring-line hover:bg-paper-3"
        >
          <AppIcon app="promote" size={44} decorative />
          <span className="min-w-0 text-sm">
            <span className="block font-bold">Your app here</span>
            <span className="block text-text-soft">Put your business on every player’s phone. Open Promote.</span>
          </span>
        </button>
      )}
    </section>
  );
}

/** A sponsored app's page inside the phone: icon, name, pitch and the way out to the advertiser's site. */
export function SponsoredAppPage({ app }: { readonly app: LivePhoneAppDto }) {
  const [leaving, setLeaving] = useState<{ readonly url: string; readonly host: string } | null>(null);
  const [opening, setOpening] = useState(false);

  const open = async (): Promise<void> => {
    setOpening(true);
    try {
      const target = (await adTrackingApi.click(app.campaignId)).url;
      const url = safeExternalUrl(target, window.location.origin);
      if (!url) throw new Error('That link isn’t available');
      setLeaving({ url: url.toString(), host: url.host });
    } catch (error) {
      toast({ title: 'That app isn’t available', body: errorMessage(error), tone: 'neutral' });
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 pt-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- media-server icon */}
      <img src={app.iconUrl} alt={`${app.name} icon`} width={112} height={112} className="size-28 rounded-[30px] bg-paper-2 object-cover shadow-[var(--shadow-lift)]" />
      <div>
        <p className="type-title text-2xl">{app.name}</p>
        {app.tagline && <p className="mt-1 text-text-soft">{app.tagline}</p>}
        <p className="mt-2 inline-block rounded-chip bg-paper-2 px-2 py-0.5 text-2xs font-bold text-text-soft">Sponsored · real advertiser</p>
      </div>
      <Button block loading={opening} icon={<ExternalLink size={18} aria-hidden />} onClick={() => void open()}>
        Open website
      </Button>
      <p className="text-xs text-text-faint">
        Ads are reviewed by a person before they run. Something wrong?{' '}
        <a href={`mailto:${site.supportEmail}?subject=${encodeURIComponent(`Ad report: ${app.name}`)}`} className="font-bold underline">
          {site.supportEmail}
        </a>
      </p>
      <Sheet open={leaving !== null} onClose={() => setLeaving(null)} title="Open sponsor link?" description="You’re leaving Inside Life for an advertiser’s website." size="sm">
        {leaving && (
          <div className="flex flex-col gap-4 pb-1">
            <div className="rounded-card bg-paper-2 p-3 text-left">
              <p className="font-bold leading-tight">{app.name}</p>
              <p className="mt-0.5 break-all text-sm text-text-soft">{leaving.host}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="paper" block onClick={() => setLeaving(null)}>
                Stay in Lagos
              </Button>
              <Button
                block
                icon={<ExternalLink size={18} aria-hidden />}
                onClick={() => {
                  window.open(leaving.url, '_blank', 'noopener,noreferrer');
                  gameEvents.emit('sfx', { id: 'ui-click' });
                  setLeaving(null);
                }}
              >
                Open link
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
