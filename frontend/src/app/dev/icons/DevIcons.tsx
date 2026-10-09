'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { APP_ICON_ART, AppIcon, type AppIconId } from '@/common/brand/app-icons';
import {
  PLACE_KINDS,
  PLACE_STYLES,
  PlaceIcon,
  drawPlaceMarker,
  type PlaceKind,
} from '@/common/brand/place-icons';

const APPS = Object.keys(APP_ICON_ART) as AppIconId[];
const SURFACES = [
  { id: 'paper', className: 'bg-paper text-text' },
  { id: 'ink', className: 'bg-ink text-on-ink' },
] as const;

/** Minimap markers as the minimap draws them (same helper, same DPR handling), half over land, half over water. */
function MarkerStrip({ kinds, radius }: { readonly kinds: readonly PlaceKind[]; readonly radius: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const gap = radius * 2 + 12;
  const width = kinds.length * gap + 8;
  const height = radius * 2 + 14;
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    element.width = Math.round(width * dpr);
    element.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e9ddc3';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#1f5f70';
    ctx.fillRect(0, height / 2, width, height / 2);
    kinds.forEach((kind, index) => drawPlaceMarker(ctx, kind, 4 + gap / 2 + index * gap, height / 2, radius));
  }, [kinds, radius, gap, width, height]);
  return <canvas ref={canvas} style={{ width, height }} className="block" aria-hidden />;
}

function Block({
  qa,
  title,
  className,
  children,
}: {
  readonly qa: string;
  readonly title: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <div data-qa={qa} className={`w-[620px] rounded-card p-4 ${className}`}>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide opacity-70">{title}</h3>
      {children}
    </div>
  );
}

const chunks = <T,>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );

export function DevIcons() {
  return (
    <main className="flex min-h-dvh flex-wrap content-start gap-6 bg-paper-2 p-6 text-text">
      {SURFACES.map((surface) => (
        <Block
          key={`apps-${surface.id}`}
          qa={`apps-${surface.id}`}
          title={`App icons · ${surface.id}`}
          className={surface.className}
        >
          <ul className="grid grid-cols-7 gap-x-2 gap-y-4">
            {APPS.map((app) => (
              <li key={app} className="flex flex-col items-center gap-1.5">
                <AppIcon app={app} size={56} decorative />
                <span className="text-xs font-bold">{APP_ICON_ART[app].name}</span>
              </li>
            ))}
          </ul>
          {[40, 28].map((size) => (
            <div key={size} className="mt-4 flex flex-wrap items-center gap-2">
              {APPS.map((app) => (
                <AppIcon key={app} app={app} size={size} />
              ))}
            </div>
          ))}
        </Block>
      ))}
      {SURFACES.map((surface) => (
        <Block
          key={`places-${surface.id}`}
          qa={`places-${surface.id}`}
          title={`Places · ${surface.id}`}
          className={surface.className}
        >
          <ul className="grid grid-cols-8 gap-x-2 gap-y-3">
            {PLACE_KINDS.map((kind) => (
              <li key={kind} className="flex flex-col items-center gap-1">
                <PlaceIcon kind={kind} size={40} decorative />
                <span className="text-center text-2xs leading-tight">{PLACE_STYLES[kind].label}</span>
              </li>
            ))}
          </ul>
          {[28, 20].map((size) => (
            <div key={size} className="mt-3 flex flex-wrap items-center gap-2">
              {PLACE_KINDS.map((kind) => (
                <PlaceIcon key={kind} kind={kind} size={size} />
              ))}
            </div>
          ))}
        </Block>
      ))}
      <Block qa="markers" title="Minimap markers (canvas, minimap radius)" className="bg-paper">
        <div className="space-y-2">
          {chunks(PLACE_KINDS, 16).map((kinds) => (
            <MarkerStrip key={kinds[0]} kinds={kinds} radius={8} />
          ))}
        </div>
      </Block>
    </main>
  );
}
