'use client';

import { CITY_MAP, DISTRICTS, districtAt, streetNameAt, type WorldPoint } from '@insidelife/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { useWorld } from '@/common/game/world-store';
import { cn } from '@/common/utils/cn';
import { livePose, livePoseFresh } from '../navigation/live-pose';
import { useOwnedLots } from '../city/layout/use-city-plan';
import { activeRoute } from '../navigation/route-state';
import { cityRaster, propertyIcons, RASTER_PX_PER_METRE, venueIcons, type MapIcon } from './map-raster';

/**
 * Heading-up minimap: the pre-rendered city raster rotated around the player, the remaining GPS route, the
 * destination pin (clamped to the rim when far) and nearby venue icons. Drawn in requestAnimationFrame at ≤30 fps
 * straight from the live pose — no React updates per frame. Tap opens the phone Map app.
 */

const METRES_ACROSS = 150;
const FRAME_MS = 1000 / 30;

interface Pose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

/** Fresh live pose, else the published (≈5 Hz) pose, else the last live pose we ever saw. */
function currentPose(): Pose | null {
  if (livePoseFresh()) return { x: livePose.x, z: livePose.z, heading: livePose.heading };
  const { position, heading } = useWorld.getState();
  if (position) return { x: position.x, z: position.z, heading };
  return livePose.updatedAt > 0 ? { x: livePose.x, z: livePose.z, heading: livePose.heading } : null;
}

function drawMinimap(ctx: CanvasRenderingContext2D, size: number, pose: Pose, icons: readonly MapIcon[]): void {
  const raster = cityRaster();
  const scale = size / METRES_ACROSS;
  const radius = size / 2;
  const { minX, minZ } = CITY_MAP.bounds;
  const rotation = -Math.PI / 2 - pose.heading;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  /** World point → canvas pixel (player at the centre, heading up). */
  const project = (p: WorldPoint): [number, number] => {
    const dx = (p.x - pose.x) * scale;
    const dz = (p.z - pose.z) * scale;
    return [radius + dx * cos - dz * sin, radius + dx * sin + dz * cos];
  };

  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#1f5f70';
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(radius, radius);
  ctx.rotate(rotation);
  const k = scale / RASTER_PX_PER_METRE;
  ctx.drawImage(raster, (minX - pose.x) * scale, (minZ - pose.z) * scale, raster.width * k, raster.height * k);
  ctx.restore();

  // Remaining route.
  const route = activeRoute.route;
  if (route) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < route.points.length; i++) {
      if ((route.cumulative[i + 1] ?? Number.POSITIVE_INFINITY) < activeRoute.along) continue;
      const [x, y] = project(route.points[i] as WorldPoint);
      if (started) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        started = true;
      }
    }
    ctx.strokeStyle = '#0e2733';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = '#f6b90b';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Venue icons (upright).
  ctx.font = '700 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const icon of icons) {
    const [x, y] = project(icon);
    if (Math.hypot(x - radius, y - radius) > radius - 8) continue;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = icon.color;
    ctx.beginPath();
    ctx.arc(x, y, 5.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(icon.glyph, x, y + 0.5);
  }

  // Destination pin, clamped to the rim when off-map.
  const destination = activeRoute.destination;
  if (destination) {
    let [x, y] = project(destination);
    const distance = Math.hypot(x - radius, y - radius);
    const edge = radius - 12;
    if (distance > edge) {
      x = radius + ((x - radius) / distance) * edge;
      y = radius + ((y - radius) / distance) * edge;
    }
    ctx.fillStyle = '#0e2733';
    ctx.beginPath();
    ctx.arc(x, y - 6, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 3);
    ctx.lineTo(x, y + 4);
    ctx.lineTo(x + 5, y - 3);
    ctx.fill();
    ctx.fillStyle = '#f6b90b';
    ctx.beginPath();
    ctx.arc(x, y - 6, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player arrow.
  ctx.translate(radius, radius);
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(7, 7);
  ctx.lineTo(0, 3.5);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.fillStyle = '#f6b90b';
  ctx.strokeStyle = '#0e2733';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** Street and district under the player, refreshed twice a second (not per frame). */
function usePlaceLabel(): { street: string | null; district: string | null } {
  const [label, setLabel] = useState<{ street: string | null; district: string | null }>({ street: null, district: null });
  useEffect(() => {
    const update = (): void => {
      const pose = currentPose();
      if (!pose) return;
      const published = useWorld.getState();
      const street = published.streetName ?? streetNameAt(pose);
      const district = published.districtName ?? DISTRICTS[districtAt(pose)].name;
      setLabel((previous) => (previous.street === street && previous.district === district ? previous : { street, district }));
    };
    update();
    const id = window.setInterval(update, 500);
    return () => window.clearInterval(id);
  }, []);
  return label;
}

export function Minimap({ className }: { readonly className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const north = useRef<HTMLSpanElement>(null);
  const openPhone = useUi((state) => state.openPhone);
  const owned = useOwnedLots();
  const icons = useMemo(
    () => [
      ...venueIcons(),
      ...propertyIcons(
        owned.map(({ lot, property }) => ({ x: (lot.footprint.minX + lot.footprint.maxX) / 2, z: (lot.footprint.minZ + lot.footprint.maxZ) / 2, name: property.label, livedIn: property.livedIn })),
      ),
    ],
    [owned],
  );
  const { street, district } = usePlaceLabel();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let last = 0;
    let lastKey = '';
    const render = (time: number): void => {
      frame = requestAnimationFrame(render);
      if (time - last < FRAME_MS || document.visibilityState !== 'visible') return;
      last = time;
      const size = canvas.clientWidth;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
      }
      const pose = currentPose() ?? { x: 0, z: 0, heading: -Math.PI / 2 };
      const key = `${pose.x.toFixed(1)}|${pose.z.toFixed(1)}|${pose.heading.toFixed(3)}|${activeRoute.version}|${activeRoute.along.toFixed(0)}|${size}`;
      if (key === lastKey) return;
      lastKey = key;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMinimap(ctx, size, pose, icons);
      if (north.current) {
        const angle = -Math.PI / 2 - pose.heading - Math.PI / 2;
        const r = size / 2 - 2;
        north.current.style.transform = `translate(${Math.cos(angle) * r}px, ${Math.sin(angle) * r}px)`;
      }
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [icons]);

  return (
    <div className={cn('pointer-events-auto flex w-[156px] flex-col items-center gap-1.5 sm:w-[188px]', className)}>
      <button
        type="button"
        onClick={() => {
          gameEvents.emit('sfx', { id: 'ui-open' });
          openPhone('map');
        }}
        aria-label={`Open the map${street ? ` — you are on ${street}` : ''}`}
        className="relative aspect-square w-full rounded-full bg-ink p-[5px] shadow-[var(--shadow-glass)] focus-visible:outline-offset-4"
      >
        <span aria-hidden className="absolute inset-[3px] rounded-full border-[3px] border-double border-danfo/90" />
        <canvas ref={canvasRef} aria-hidden className="relative block size-full rounded-full" />
        <span
          ref={north}
          aria-hidden
          className="type-title absolute left-1/2 top-1/2 -ml-[9px] -mt-[9px] grid size-[18px] place-items-center rounded-full bg-danfo text-[10px] leading-none text-ink"
        >
          N
        </span>
      </button>
      {street || district ? (
        <p className="max-w-full rounded-chip bg-ink/85 px-2.5 py-1 text-center text-on-ink shadow-[var(--shadow-glass)]">
          {street && <span className="type-title block truncate text-[13px] leading-tight">{street}</span>}
          {district && <span className="block truncate text-2xs text-on-ink-soft">{district}</span>}
        </p>
      ) : null}
    </div>
  );
}
