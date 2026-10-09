'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Appearance, ClothingSlot, Gender } from '@insidelife/shared';
import { AVATAR_SEAT_HEIGHT, Avatar, type AvatarClip, type AvatarLod, type AvatarStance } from '@/common/three/avatar';

interface LineupEntry {
  readonly label: string;
  readonly gender: Gender;
  readonly appearance: Appearance;
  readonly outfit: Readonly<Partial<Record<ClothingSlot, string>>>;
  readonly animation: AvatarClip;
  readonly stance?: AvatarStance;
  readonly mood?: number;
}

const a = (partial: Partial<Appearance>): Appearance => ({ bodyType: 'average', height: 1, skinTone: 2, hairStyle: 'fade', hairColor: 0, facialHair: 'none', eyeStyle: 'round', ...partial });

const LINEUP: readonly LineupEntry[] = [
  { label: 'Owambe king', gender: 'male', appearance: a({ bodyType: 'broad', skinTone: 1, hairStyle: 'fade', facialHair: 'full-beard', eyeStyle: 'almond' }), outfit: { full: 'aso-oke-agbada', headwear: 'abeti-aja-fila', shoes: 'horsebit-loafers', accessory: 'coral-beads' }, animation: 'idle', mood: 80 },
  { label: 'Aso-ebi queen', gender: 'female', appearance: a({ bodyType: 'curvy', skinTone: 3, hairStyle: 'braids', eyeStyle: 'bright' }), outfit: { full: 'aso-oke-iro-buba', headwear: 'aso-oke-gele', shoes: 'strappy-heels', accessory: 'designer-handbag' }, animation: 'dance' },
  { label: 'Ankara gown + gele', gender: 'female', appearance: a({ skinTone: 0, hairStyle: 'bun', eyeStyle: 'almond' }), outfit: { full: 'ankara-mermaid-gown', headwear: 'auto-gele', shoes: 'block-heels' }, animation: 'wave' },
  { label: 'Marina banker', gender: 'male', appearance: a({ skinTone: 4, hairStyle: 'lowcut', facialHair: 'goatee', eyeStyle: 'sleepy', height: 1.06 }), outfit: { full: 'corporate-navy-suit', shoes: 'leather-oxfords', accessory: 'smart-watch', eyewear: 'reading-glasses' }, animation: 'talk' },
  { label: 'Lekki babe', gender: 'female', appearance: a({ bodyType: 'slim', skinTone: 5, hairStyle: 'bone-straight', hairColor: 4 }), outfit: { top: 'lekki-brunch-crop', bottom: 'ripped-skinny-jeans', shoes: 'hypebeast-sneakers', eyewear: 'okrika-shades' }, animation: 'phone' },
  { label: 'Detty December', gender: 'male', appearance: a({ skinTone: 2, hairStyle: 'twists', hairColor: 3 }), outfit: { top: 'detty-december-hoodie', bottom: 'tech-fleece-joggers', shoes: 'running-sneakers', headwear: 'okrika-snapback', accessory: 'wireless-headphones' }, animation: 'walk' },
  { label: 'Super Eagles fan', gender: 'male', appearance: a({ skinTone: 1, hairStyle: 'afro', bodyType: 'slim' }), outfit: { top: 'super-eagles-jersey', bottom: 'okrika-cargo-shorts', shoes: 'rubber-slides' }, animation: 'cheer' },
  { label: 'LUTH doctor', gender: 'female', appearance: a({ skinTone: 3, hairStyle: 'puff', eyeStyle: 'bright' }), outfit: { full: 'hospital-scrubs', shoes: 'okrika-sneakers' }, animation: 'idle', mood: 50 },
  { label: 'Corper', gender: 'male', appearance: a({ skinTone: 5, hairStyle: 'cornrows' }), outfit: { full: 'nysc-khaki', shoes: 'okrika-boots' }, animation: 'idle', mood: 25 },
  { label: 'Iya Basira', gender: 'female', appearance: a({ bodyType: 'curvy', skinTone: 2, hairStyle: 'big-afro', eyeStyle: 'almond' }), outfit: { top: 'ankara-peplum-blouse', bottom: 'ankara-wrapper', shoes: 'okrika-sandals', accessory: 'plastic-coral-beads' }, animation: 'cook' },
  { label: 'Alhaji', gender: 'male', appearance: a({ bodyType: 'broad', skinTone: 3, hairStyle: 'locs', facialHair: 'moustache', height: 0.96 }), outfit: { full: 'cashmere-kaftan', headwear: 'hand-woven-fila', shoes: 'aba-palm-slippers' }, animation: 'pray' },
  { label: 'Gym bro', gender: 'male', appearance: a({ bodyType: 'broad', skinTone: 0, hairStyle: 'bald', facialHair: 'stubble' }), outfit: { top: 'gym-tank', bottom: 'linen-shorts', shoes: 'running-sneakers' }, animation: 'exercise' },
  { label: 'Igbo royalty', gender: 'female', appearance: a({ skinTone: 6, hairStyle: 'cornrows', eyeStyle: 'round' }), outfit: { top: 'lace-blouse', bottom: 'george-wrapper', headwear: 'wool-beret', eyewear: 'gold-aviators', shoes: 'block-heels' }, animation: 'eat', stance: 'sit' },
  { label: 'Adire drip', gender: 'male', appearance: a({ skinTone: 2, hairStyle: 'lowcut', facialHair: 'stubble' }), outfit: { top: 'adire-shirt', bottom: 'sokoto-trousers', shoes: 'suede-loafers', headwear: 'silky-durag', accessory: 'iced-cuban-chain' }, animation: 'run' },
  { label: 'Ladipo mechanic', gender: 'female', appearance: a({ skinTone: 4, hairStyle: 'locs', hairColor: 5 }), outfit: { full: 'ladipo-overalls', headwear: 'site-hard-hat', shoes: 'okrika-boots' }, animation: 'type', stance: 'sit' },
  { label: 'Jumu’ah best', gender: 'female', appearance: a({ skinTone: 3, hairStyle: 'braids', eyeStyle: 'almond' }), outfit: { full: 'ankara-buba-iro', headwear: 'ankara-hijab', shoes: 'okrika-sandals' }, animation: 'idle', mood: 80 },
  { label: 'Silk hijab', gender: 'female', appearance: a({ skinTone: 1, hairStyle: 'bun', eyeStyle: 'bright', bodyType: 'curvy' }), outfit: { full: 'satin-dinner-gown', headwear: 'silk-hijab-emerald', shoes: 'block-heels', accessory: 'leather-tote' }, animation: 'wave' },
  { label: 'Okrika sundress', gender: 'female', appearance: a({ skinTone: 7, hairStyle: 'afro', bodyType: 'slim' }), outfit: { full: 'okrika-sundress', shoes: 'rubber-slides', accessory: 'okrika-backpack' }, animation: 'read', stance: 'sit' },
];

const COLS = 8;
const SPACING_X = 1.08;
const SPACING_Z = 1.9;

function useParam(name: string): string | null {
  const params = useSearchParams();
  return params.get(name);
}

export function DevAvatars() {
  const anim = useParam('anim') as AvatarClip | null;
  // With `anim`, `stance=stand|sit|kneel` overrides the clip's own stance (e.g. drinking standing at a counter).
  const stanceParam = useParam('stance') as AvatarStance | null;
  const lod = (useParam('lod') ?? 'high') as AvatarLod;
  const focusParam = useParam('focus');
  const focus = focusParam === null ? null : Number(focusParam);
  const entries = focus === null ? LINEUP : LINEUP.filter((_, index) => index === focus);
  const [info, setInfo] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => {
      const gl = (window as unknown as { __il_gl?: { info: { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } } } }).__il_gl;
      if (gl) setInfo(`calls ${gl.info.render.calls} · tris ${gl.info.render.triangles} · geo ${gl.info.memory.geometries} · tex ${gl.info.memory.textures}`);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const yaw = Number(useParam('yaw') ?? '0.25');
  const cam: [number, number, number] = focus === null ? [0, 2.3, 7.4] : [Math.sin(yaw) * 3.5, 1.35, Math.cos(yaw) * 3.5];
  const target: [number, number, number] = focus === null ? [0, 0.75, -0.9] : [0, 0.88, 0];

  return (
    <main className="fixed inset-0 bg-[#e9dcc6]">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: cam, fov: focus === null ? 40 : 32 }}
        onCreated={({ gl }) => {
          (window as unknown as { __il_gl: unknown }).__il_gl = gl;
        }}
      >
        <color attach="background" args={['#e9dcc6']} />
        <hemisphereLight args={['#fff4e2', '#8a6a4a', 1.35]} />
        <directionalLight position={[3, 6, 5]} intensity={2.1} color="#fff1dc" />
        <directionalLight position={[-4, 3, -4]} intensity={0.9} color="#b9d7ff" />
        <mesh rotation-x={-Math.PI / 2} position-y={-0.001}>
          <circleGeometry args={[12, 48]} />
          <meshStandardMaterial color="#d8c4a2" roughness={0.95} />
        </mesh>
        {entries.map((entry, index) => {
          const col = index % COLS;
          const row = Math.floor(index / COLS);
          const x = focus === null ? (col - (COLS - 1) / 2) * SPACING_X : 0;
          const z = focus === null ? -row * SPACING_Z : 0;
          const animation = anim ?? entry.animation;
          const seated = entry.stance === 'sit' && !anim;
          return (
            <group key={entry.label} position={[x, 0, z]}>
              {seated && (
                <mesh position={[0, AVATAR_SEAT_HEIGHT / 2, -0.03]}>
                  <boxGeometry args={[0.42, AVATAR_SEAT_HEIGHT, 0.4]} />
                  <meshStandardMaterial color="#a0673a" roughness={0.7} />
                </mesh>
              )}
              <Avatar appearance={entry.appearance} outfit={entry.outfit} gender={entry.gender} animation={animation} stance={anim ? (stanceParam ?? undefined) : entry.stance} mood={entry.mood ?? 75} lod={lod} />
            </group>
          );
        })}
        <OrbitControls target={target} makeDefault />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 rounded-card bg-ink/80 px-3 py-2 font-mono text-xs text-on-ink">
        <div>Avatar lineup ({lod}) — ?anim=walk · ?stance=sit · ?lod=low · ?focus=0</div>
        <div>{info}</div>
      </div>
    </main>
  );
}
