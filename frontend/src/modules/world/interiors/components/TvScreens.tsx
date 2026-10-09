'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Color, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { adTrackingApi } from '@/common/promotions/ad-tracking';
import { useLiveAds } from '@/common/promotions/use-live-ads';
import { setProps } from '../../city/lib/mutate';
import { FURNITURE_MANIFEST } from '../kit/kit-manifest';
import { FURNITURE_SCALE } from '../kit/furniture-kit';
import type { FurniturePlacement } from '../templates/types';

/**
 * Lagos TV on every television in the room (homes, bukas, bars, offices): paid "Lagos TV" ads from Promote rotate
 * with the channel's own card; the screen goes dark in a power cut. Impressions are counted when an ad has been on
 * screen for a few seconds, batched.
 */

const SLOT_ID = 'lagos-tv';
const ROTATE_SECONDS = 10;
const IMPRESSION_AFTER_MS = 3_000;
const FLUSH_MS = 20_000;

/** Where the picture sits on each TV model's front face (fractions of the model's width/height). */
const SCREENS: Readonly<Partial<Record<FurniturePlacement['model'], { readonly w: number; readonly h: number; readonly cx: number; readonly cy: number }>>> = {
  televisionModern: { w: 0.9, h: 0.72, cx: 0, cy: 0.6 },
  televisionVintage: { w: 0.62, h: 0.66, cx: -0.12, cy: 0.52 },
};

interface Screen {
  readonly key: string;
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  readonly width: number;
  readonly height: number;
}

function channelCard(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const css = getComputedStyle(document.documentElement);
    const display = `${css.getPropertyValue('--font-anybody').trim() || "'Arial Narrow'"}, Arial, sans-serif`;
    const body = `${css.getPropertyValue('--font-atkinson').trim() || 'Arial'}, Arial, sans-serif`;
    const gradient = ctx.createLinearGradient(0, 0, 512, 288);
    gradient.addColorStop(0, '#0e2733');
    gradient.addColorStop(1, '#13606b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = '#f6b90b';
    ctx.font = `900 64px ${display}`;
    ctx.textBaseline = 'top';
    ctx.fillText('LAGOS TV', 32, 40);
    ctx.fillRect(32, 120, 120, 8);
    ctx.fillRect(32, 136, 120, 8);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 26px ${body}`;
    ctx.fillText('News · Nollywood · Football', 32, 168);
    ctx.fillStyle = '#f6b90b';
    ctx.font = `800 22px ${body}`;
    ctx.fillText('Your ad here · open Promote on your phone', 32, 222);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function TvScreens({ furniture, powerCut }: { readonly furniture: readonly FurniturePlacement[]; readonly powerCut: boolean }) {
  const { data: live } = useLiveAds();
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const screens = useMemo<readonly Screen[]>(
    () =>
      furniture.flatMap((piece, index): Screen[] => {
        const spec = SCREENS[piece.model];
        if (!spec) return [];
        const [w, h, d] = FURNITURE_MANIFEST[piece.model].size;
        const scale = FURNITURE_SCALE * (piece.scale ?? 1);
        const yaw = ((piece.rot ?? 0) * Math.PI) / 180;
        const front = (d * scale) / 2 + 0.006;
        const across = spec.cx * w * scale;
        return [
          {
            key: `${piece.model}:${index}`,
            position: [piece.at[0] + Math.sin(yaw) * front + Math.cos(yaw) * across, (piece.y ?? 0) + spec.cy * h * scale, piece.at[1] + Math.cos(yaw) * front - Math.sin(yaw) * across],
            yaw,
            width: spec.w * w * scale,
            height: spec.h * h * scale,
          },
        ];
      }),
    [furniture],
  );

  const resources = useMemo(() => {
    const card = channelCard();
    const material = new MeshBasicMaterial({ map: card, toneMapped: false });
    return { card, material, plane: new PlaneGeometry(1, 1), off: new Color('#050607'), on: new Color('#ffffff') };
    // The screens share one material; per-frame changes go through setProps (three.js state, not React state).
  }, []);
  const creatives = useRef(new Map<string, Texture | 'loading' | 'failed'>());
  const shownSince = useRef<{ campaignId: string | null; since: number; counted: boolean }>({ campaignId: null, since: 0, counted: false });
  const pending = useRef<string[]>([]);

  useEffect(() => {
    const textures = creatives.current;
    return () => {
      resources.card.dispose();
      resources.material.dispose();
      resources.plane.dispose();
      for (const texture of textures.values()) if (typeof texture !== 'string') texture.dispose();
      textures.clear();
    };
  }, [resources]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const batch = pending.current.splice(0);
      if (batch.length > 0) adTrackingApi.impressions({ campaignIds: batch }).catch(() => pending.current.push(...batch));
    }, FLUSH_MS);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = useRef(1);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.5 || screens.length === 0) return;
    elapsed.current = 0;
    const material = resources.material;
    if (powerCut) {
      if (material.map !== null) setProps(material, { map: null, color: resources.off, needsUpdate: true });
      return;
    }
    const now = Date.now();
    const ads = liveRef.current?.slots.find((slot) => slot.slotId === SLOT_ID)?.creatives ?? [];
    const rotation = [...ads.map((ad) => ad.campaignId), null];
    const index = Math.floor(now / (ROTATE_SECONDS * 1000)) % rotation.length;
    const campaignId = rotation[index] ?? null;
    const ad = ads.find((entry) => entry.campaignId === campaignId);
    let map: Texture = resources.card;
    if (ad) {
      const cached = creatives.current.get(ad.imageUrl);
      if (cached === undefined) {
        creatives.current.set(ad.imageUrl, 'loading');
        new TextureLoader().load(
          ad.imageUrl,
          (texture) => {
            texture.colorSpace = SRGBColorSpace;
            creatives.current.set(ad.imageUrl, texture);
          },
          undefined,
          () => creatives.current.set(ad.imageUrl, 'failed'),
        );
      } else if (typeof cached !== 'string') map = cached;
    }
    if (material.map !== map) setProps(material, { map, color: resources.on, needsUpdate: true });
    // One impression per ad per showing, once it has been on screen a moment.
    const shown = map !== resources.card ? campaignId : null;
    if (shown !== shownSince.current.campaignId) shownSince.current = { campaignId: shown, since: now, counted: false };
    else if (shown && !shownSince.current.counted && now - shownSince.current.since > IMPRESSION_AFTER_MS) {
      shownSince.current.counted = true;
      pending.current.push(shown);
    }
  });

  return (
    <>
      {screens.map((screen) => (
        <mesh key={screen.key} geometry={resources.plane} material={resources.material} position={screen.position} rotation-y={screen.yaw} scale={[screen.width, screen.height, 1]} />
      ))}
    </>
  );
}
