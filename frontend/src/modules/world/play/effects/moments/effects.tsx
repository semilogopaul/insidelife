'use client';

import { useFrame } from '@react-three/fiber';
import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, ConeGeometry, CylinderGeometry, LatheGeometry, MeshStandardMaterial, Vector2, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import type { VenueMomentDto } from '@insidelife/shared';
import { gameClock } from '@/common/game/game-clock';
import type { RoomAnchors, Vec3 } from './anchors';
import { FxContext } from './fx-fields';
import { TextPanel } from './text-panel';

export interface EffectProps {
  readonly moment: VenueMomentDto;
  readonly anchors: RoomAnchors;
  /** Calm version: no particles, no flashing, objects hold still. */
  readonly reduced: boolean;
}

/** Seconds since the moment started (server clock), so someone walking in mid-moment sees the right frame. */
const elapsed = (moment: VenueMomentDto): number => (gameClock.serverNow() - moment.startsAt) / 1_000;
const seconds = (moment: VenueMomentDto): number => moment.durationMs / 1_000;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const above = (at: Vec3, dy: number): Vec3 => [at[0], at[1] + dy, at[2]];
const upper = (handle: string): string => `@${handle.toUpperCase()}`;

/** Emits `rate` particles per second from inside useFrame without allocating. */
function useRate(): (rate: number, delta: number) => number {
  const carry = useRef(0);
  return (rate, delta) => {
    carry.current += rate * delta;
    const whole = Math.floor(carry.current);
    carry.current -= whole;
    return whole;
  };
}

/**
 * Fire a burst once when the moment reaches second `at`. Someone who walks in later doesn't get a pile-up of old
 * bursts: a cue more than a second in the past is skipped.
 */
function useCue(): (key: string, at: number, t: number, fire: () => void) => void {
  const fired = useRef(new Set<string>());
  return (key, at, t, fire) => {
    if (t < at || fired.current.has(key)) return;
    fired.current.add(key);
    if (t < at + 1) fire();
  };
}

const BOTTLE_LOOKS: Readonly<Record<string, { readonly glass: string; readonly foil: string; readonly opacity: number }>> = {
  'premium-vodka': { glass: '#dfe9f2', foil: '#c0c7cf', opacity: 0.8 },
  champagne: { glass: '#1f4d2b', foil: '#d4af37', opacity: 1 },
  cognac: { glass: '#8a4512', foil: '#d4af37', opacity: 0.95 },
  'bottle-parade': { glass: '#1f4d2b', foil: '#d4af37', opacity: 1 },
  'champagne-shower': { glass: '#1f4d2b', foil: '#d4af37', opacity: 1 },
};

/** A bottle (lathe) with a foil neck; ~32 cm tall. Disposes what it makes. */
function useBottleParts(tier: string) {
  const parts = useMemo(() => {
    const look = BOTTLE_LOOKS[tier] ?? BOTTLE_LOOKS.champagne!;
    const profile = [
      [0, 0],
      [0.045, 0],
      [0.048, 0.02],
      [0.048, 0.18],
      [0.03, 0.24],
      [0.016, 0.27],
      [0.016, 0.32],
      [0, 0.32],
    ].map(([x, y]) => new Vector2(x, y));
    return {
      body: new LatheGeometry(profile, 12),
      foil: new CylinderGeometry(0.019, 0.019, 0.06, 10),
      glass: new MeshStandardMaterial({ color: look.glass, roughness: 0.15, metalness: 0.1, transparent: look.opacity < 1, opacity: look.opacity, emissive: look.glass, emissiveIntensity: 0.25 }),
      gold: new MeshStandardMaterial({ color: look.foil, roughness: 0.3, metalness: 0.9, emissive: look.foil, emissiveIntensity: 0.35 }),
    };
  }, [tier]);
  useLayoutEffect(
    () => () => {
      for (const resource of Object.values(parts)) resource.dispose();
    },
    [parts],
  );
  return parts;
}

function BottleMesh({ parts }: { readonly parts: ReturnType<typeof useBottleParts> }) {
  return (
    <group>
      <mesh geometry={parts.body} material={parts.glass} />
      <mesh geometry={parts.foil} material={parts.gold} position={[0, 0.3, 0]} />
    </group>
  );
}

/** One bottle (or a parade) carried from the bar to the table, sparklers fizzing on top. */
export function BottleEffect({ moment, anchors, reduced }: EffectProps) {
  const parade = moment.effect === 'parade';
  const count = parade ? 6 : 1;
  const sparklers = moment.tier === 'cognac' ? 2 : 1;
  const parts = useBottleParts(moment.tier);
  const fx = useContext(FxContext);
  const rate = useRate();
  const bottles = useRef<Array<Group | null>>([]);
  const tag = useRef<Group>(null);
  const from: Vec3 = [anchors.bar[0] + 0.6, anchors.bar[1], anchors.bar[2]];
  const via: Vec3 = [anchors.floor[0], 1.1, anchors.floor[2] + 0.6];
  const to = anchors.table;

  useFrame((_, delta) => {
    const t = elapsed(moment);
    const total = seconds(moment);
    // One budget per frame, shared by every sparkler on every bottle.
    const budget = reduced ? 0 : rate(55 * sparklers * count * (parade ? 0.7 : 1), delta);
    const perSparkler = Math.ceil(budget / (sparklers * count));
    for (let index = 0; index < count; index++) {
      const node = bottles.current[index];
      if (!node) continue;
      // Parade: a line of bottles bar → dance floor → table; a single bottle walks straight over.
      const walk = parade ? ease((t - index * 0.45) / (total * 0.7)) : ease(t / Math.min(3, total * 0.3));
      const p = reduced ? 1 : walk;
      const [ax, ay, az] = parade && p < 0.5 ? from : parade ? via : from;
      const [bx, by, bz] = parade && p < 0.5 ? via : to;
      const local = parade ? (p < 0.5 ? p * 2 : (p - 0.5) * 2) : p;
      const bob = reduced ? 0 : Math.sin(t * 6 + index) * 0.03;
      const spacing = parade ? (index - (count - 1) / 2) * 0.22 : 0;
      node.position.set(lerp(ax, bx, local) + spacing, lerp(ay, by, local) + bob, lerp(az, bz, local));
      const fade = Math.min(1, Math.max(0, total - t) / 0.8);
      node.scale.setScalar(Math.max(0.001, fade));
      if (perSparkler > 0 && fade > 0.2) {
        for (let s = 0; s < sparklers; s++) {
          fx.sparks.current?.emit(perSparkler, [node.position.x + (s - (sparklers - 1) / 2) * 0.05, node.position.y + 0.42, node.position.z], { up: 1.4, spread: 0.45, gravity: 2.5, life: 0.6 });
        }
      }
      if (index === 0 && tag.current) tag.current.position.set(node.position.x, node.position.y + 0.75, node.position.z);
    }
  });

  return (
    <group>
      {Array.from({ length: count }, (_, index) => (
        <group
          key={index}
          ref={(node) => {
            bottles.current[index] = node;
          }}
          position={[from[0], from[1], from[2]]}
        >
          <BottleMesh parts={parts} />
          {/* The sparkler stick. */}
          <mesh position={[0, 0.39, 0]}>
            <cylinderGeometry args={[0.004, 0.004, 0.12, 4]} />
            <meshBasicMaterial color="#e8e1cf" />
          </mesh>
        </group>
      ))}
      <group ref={tag} position={[to[0], to[1] + 0.75, to[2]]}>
        <TextPanel
          billboard
          lines={[moment.to ? upper(moment.to.handle) : upper(moment.from.handle)]}
          size={[1.1, 0.38]}
          position={[0, 0, 0]}
          style={{ bg: 'rgba(11,7,16,0.85)', fg: '#f6b90b', kicker: `${moment.label.toUpperCase()} FROM ${upper(moment.from.handle)}`, kickerColor: '#ffffff', resolution: 768 }}
        />
      </group>
    </group>
  );
}

/** A soft beam onto the dance floor (shoutouts); the name floats over the DJ. */
export function SpotlightEffect({ moment, anchors, reduced }: EffectProps) {
  const beam = useRef<Mesh>(null);
  const glow = useRef<MeshBasicMaterial>(null);
  const geometry = useMemo(() => {
    const cone = new ConeGeometry(0.9, anchors.ceiling, 24, 1, true);
    cone.translate(0, -anchors.ceiling / 2, 0);
    return cone;
  }, [anchors.ceiling]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const t = elapsed(moment);
    if (glow.current) glow.current.opacity = reduced ? 0.14 : 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t * 5));
    if (beam.current && !reduced) beam.current.rotation.z = Math.sin(t * 0.8) * 0.12;
  });
  return (
    <group>
      <mesh ref={beam} geometry={geometry} position={[anchors.floor[0], anchors.ceiling, anchors.floor[2]]}>
        <meshBasicMaterial ref={glow} color="#fff4c2" transparent opacity={0.14} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <TextPanel billboard lines={[upper(moment.from.handle)]} size={[1.6, 0.5]} position={above(anchors.dj, 0.75)} style={{ bg: 'rgba(11,7,16,0.85)', fg: '#f6b90b', kicker: 'SHOUT OUT', kickerColor: '#ffffff', resolution: 768 }} />
    </group>
  );
}

/** Confetti: a big shoutout rains it every few seconds; the cannons blast from both sides of the stage. */
export function ConfettiEffect({ moment, anchors, reduced }: EffectProps) {
  const fx = useContext(FxContext);
  const cue = useCue();
  const cannon = moment.kind === 'confetti-cannon';
  useFrame(() => {
    if (reduced) return;
    const t = elapsed(moment);
    if (cannon) {
      for (const at of [0, 1.3, 3]) cue(`blast-${at}`, at, t, () => anchors.sides.forEach((side) => fx.confetti.current?.burst(55, above(side, 0.3), 1.1, 5.5)));
      return;
    }
    const wave = Math.floor(Math.max(0, t) / 2.5);
    cue(`rain-${wave}`, wave * 2.5, t, () => fx.confetti.current?.burst(45, [anchors.floor[0], anchors.ceiling - 0.2, anchors.floor[2]], 1.8, 0.3));
  });
  return cannon ? <TextPanel billboard lines={[upper(moment.from.handle)]} size={[1.4, 0.45]} position={above(anchors.stage, 2)} style={{ bg: 'rgba(11,7,16,0.85)', fg: '#21d4fd', kicker: 'CONFETTI CANNON', kickerColor: '#ffffff', resolution: 768 }} /> : <SpotlightEffect moment={moment} anchors={anchors} reduced={reduced} />;
}

/** Odogwu: the name on the LED wall, CO2 jets, firework fountains and a confetti drop. */
export function FireworksEffect({ moment, anchors, reduced }: EffectProps) {
  const fx = useContext(FxContext);
  const cue = useCue();
  const rate = useRate();
  const jets = useRef<Array<Mesh | null>>([]);
  const plumes = useRef<Array<MeshBasicMaterial | null>>([]);
  const geometry = useMemo(() => {
    // A plume: narrow at the nozzle, opening upwards, 2.4 m tall.
    const cone = new ConeGeometry(0.35, 2.4, 16, 1, true);
    cone.rotateX(Math.PI);
    cone.translate(0, 1.2, 0);
    return cone;
  }, []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    const t = elapsed(moment);
    // CO2 blasts at 0, 8 and 16 s: a white plume that hisses up and fades.
    const blast = [0, 8, 16].reduce((best, at) => Math.max(best, t >= at && t < at + 1.4 ? 1 - (t - at) / 1.4 : 0), 0);
    for (const plume of plumes.current) if (plume) plume.opacity = reduced ? 0 : blast * 0.55;
    for (const jet of jets.current) if (jet) jet.scale.set(1, 0.4 + blast * 0.8, 1);
    if (reduced) return;
    cue('drop', 0, t, () => fx.confetti.current?.burst(80, [anchors.floor[0], anchors.ceiling - 0.2, anchors.floor[2]], 2, 0.4));
    const fountain = (t < 6 || (t > 11 && t < 17) || t > seconds(moment) - 4) ? rate(90, delta) : 0;
    for (const side of anchors.sides) fx.sparks.current?.emit(Math.ceil(fountain / 2), above(side, 0.1), { up: 3.8, spread: 0.3, gravity: 3.2, life: 1, color: '#ffcf5a', size: 1.3 });
  });
  const led = anchors.led;
  return (
    <group>
      {anchors.sides.map((side, index) => (
        <mesh
          key={index}
          ref={(node) => {
            jets.current[index] = node;
          }}
          geometry={geometry}
          position={[side[0], side[1], side[2]]}
        >
          <meshBasicMaterial
            ref={(node) => {
              plumes.current[index] = node;
            }}
            color="#f4f8ff"
            transparent
            opacity={0}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      {led ? (
        <TextPanel
          lines={[upper(moment.from.handle), ...(moment.message ? [moment.message] : [])]}
          size={[led.size[0], led.size[1] * (moment.message ? 1.6 : 1)]}
          position={led.at}
          rotY={led.rotY}
          flash={!reduced}
          style={{ bg: '#0b0710', fg: '#ffffff', resolution: 1024 }}
        />
      ) : (
        <TextPanel billboard lines={[upper(moment.from.handle)]} size={[2, 0.6]} position={above(anchors.stage, 2.2)} flash={!reduced} style={{ bg: '#0b0710', fg: '#ffffff', kicker: 'ODOGWU', kickerColor: '#f6b90b' }} />
      )}
    </group>
  );
}

/** Birthday: a two-tier cake with sparklers on the stage front, confetti, and the name over it. */
export function CakeEffect({ moment, anchors, reduced }: EffectProps) {
  const fx = useContext(FxContext);
  const cue = useCue();
  const rate = useRate();
  const at: Vec3 = [anchors.stage[0], anchors.stage[1], anchors.stage[2] + 0.2];
  const name = moment.to ? moment.to.handle : moment.from.handle;
  useFrame((_, delta) => {
    if (reduced) return;
    const t = elapsed(moment);
    cue('pop', 0, t, () => fx.confetti.current?.burst(60, [at[0], anchors.ceiling - 0.3, at[2] + 0.6], 1.6, 0.4));
    cue('cheer', 6, t, () => fx.confetti.current?.burst(40, [anchors.floor[0], anchors.ceiling - 0.2, anchors.floor[2]], 1.8, 0.3));
    const sparks = rate(t < seconds(moment) - 1 ? 70 : 0, delta);
    for (const dx of [-0.09, 0.09]) fx.sparks.current?.emit(Math.ceil(sparks / 2), [at[0] + dx, at[1] + 0.62, at[2]], { up: 1.3, spread: 0.4, gravity: 2.5, life: 0.6 });
  });
  return (
    <group>
      <group position={[at[0], at[1], at[2]]}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.26, 0.26, 0.24, 24]} />
          <meshStandardMaterial color="#f7e7ef" roughness={0.6} emissive="#f7e7ef" emissiveIntensity={0.15} />
        </mesh>
        <mesh position={[0, 0.33, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.18, 24]} />
          <meshStandardMaterial color="#c8287a" roughness={0.5} emissive="#c8287a" emissiveIntensity={0.2} />
        </mesh>
        {[-0.09, 0.09].map((dx) => (
          <mesh key={dx} position={[dx, 0.5, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.18, 4]} />
            <meshBasicMaterial color="#e8e1cf" />
          </mesh>
        ))}
      </group>
      <TextPanel billboard lines={[upper(name)]} size={[1.6, 0.5]} position={above(at, 1.25)} style={{ bg: 'rgba(11,7,16,0.85)', fg: '#ff7ad8', kicker: 'HAPPY BIRTHDAY', kickerColor: '#ffffff', resolution: 768 }} />
    </group>
  );
}

/** Champagne shower: a bottle over the dance floor sprays droplets in a sweeping arc. */
export function ShowerEffect({ moment, anchors, reduced }: EffectProps) {
  const parts = useBottleParts('champagne-shower');
  const fx = useContext(FxContext);
  const rate = useRate();
  const holder = useRef<Group>(null);
  const at: Vec3 = [anchors.floor[0], 1.7, anchors.floor[2]];
  useFrame((_, delta) => {
    const t = elapsed(moment);
    const node = holder.current;
    if (!node) return;
    const sweep = reduced ? 0 : Math.sin(t * 1.6) * 0.9;
    node.rotation.set(0, sweep, -2.2);
    if (reduced || t > seconds(moment) * 0.8) return;
    const drops = rate(140, delta);
    const tip: Vec3 = [at[0] + Math.cos(sweep) * 0.3, at[1] - 0.05, at[2] - Math.sin(sweep) * 0.3];
    fx.sparks.current?.emit(drops, tip, { up: 2.6, spread: 1.3, gravity: 6, life: 1.1, color: '#fff1bf', size: 1.5 });
  });
  return (
    <group>
      <group ref={holder} position={[at[0], at[1], at[2]]}>
        <group position={[0, -0.16, 0]}>
          <BottleMesh parts={parts} />
        </group>
      </group>
      <TextPanel billboard lines={[upper(moment.from.handle)]} size={[1.4, 0.45]} position={above(at, 0.9)} style={{ bg: 'rgba(11,7,16,0.85)', fg: '#f6b90b', kicker: 'CHAMPAGNE SHOWER', kickerColor: '#ffffff', resolution: 768 }} />
    </group>
  );
}

/** The VIP section's sign shows the holder's name until closing. */
export function VipSignEffect({ moment, anchors }: EffectProps) {
  const vip = anchors.vip;
  const style = { bg: '#0b0710', fg: '#f6b90b', kicker: 'VIP · RESERVED FOR', kickerColor: '#ffffff', resolution: 768 } as const;
  if (vip) {
    const height = Math.max(vip.size[1] * 1.6, 0.6);
    return <TextPanel lines={[upper(moment.from.handle)]} size={[Math.max(vip.size[0] * 1.3, 1.6), height]} position={[vip.at[0], vip.at[1] - (height - vip.size[1]) / 2, vip.at[2]]} rotY={vip.rotY} style={style} />;
  }
  return <TextPanel billboard lines={[upper(moment.from.handle)]} size={[1.5, 0.5]} position={above(anchors.table, 1.2)} style={style} />;
}

/** A tip: a little cheer of sparks at the DJ booth or the bar, and the tipper's name. */
export function GlowEffect({ moment, anchors, reduced }: EffectProps) {
  const fx = useContext(FxContext);
  const cue = useCue();
  const at = moment.tier === 'tip-dj' ? anchors.dj : anchors.bar;
  useFrame(() => {
    if (reduced) return;
    const t = elapsed(moment);
    for (const when of [0, 1.5, 3]) cue(`puff-${when}`, when, t, () => fx.sparks.current?.emit(36, above(at, 0.2), { up: 1.8, spread: 0.7, gravity: 2, life: 0.8, color: '#9fe8ff' }));
  });
  return <TextPanel billboard lines={[upper(moment.from.handle)]} size={[1.2, 0.4]} position={above(at, 0.8)} style={{ bg: 'rgba(11,7,16,0.85)', fg: '#9fe8ff', kicker: moment.tier === 'tip-dj' ? 'TIPPED THE DJ' : 'TIPPED THE BAR', kickerColor: '#ffffff', resolution: 768 }} />;
}

/** Which effect a moment plays. */
export function MomentEffect(props: EffectProps) {
  switch (props.moment.effect) {
    case 'sparkler':
    case 'parade':
      return <BottleEffect {...props} />;
    case 'spotlight':
      return <SpotlightEffect {...props} />;
    case 'confetti':
      return <ConfettiEffect {...props} />;
    case 'fireworks':
      return <FireworksEffect {...props} />;
    case 'cake':
      return <CakeEffect {...props} />;
    case 'shower':
      return <ShowerEffect {...props} />;
    case 'vip-sign':
      return <VipSignEffect {...props} />;
    case 'glow':
      return <GlowEffect {...props} />;
  }
}
