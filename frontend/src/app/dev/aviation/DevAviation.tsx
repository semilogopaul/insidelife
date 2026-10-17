'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports -- dev-only QA route renders the aviation sub-feature directly (the world feature mounts it in-game).
import { AIRCRAFT_CLASSES, AIRCRAFT_SPECS, Aircraft, DEFAULT_LIVERY, FlightSequence, Apron, type AircraftClass, type AircraftLivery, type ApronPlane } from '@/modules/world/aviation';

const LIVERIES: readonly AircraftLivery[] = [
  { base: '#f4f2ec', accent: '#0a7d3c', name: 'AIR TOLU', registration: '5N-TOL' },
  { base: '#1c2430', accent: '#f6b90b', name: 'GOLDEN EAGLE', registration: '5N-GEA' },
  { base: '#d94a2b', accent: '#ffffff', name: 'LAGOS LION', registration: '5N-LIO' },
  { base: '#2d8fd5', accent: '#f4f2ec', name: 'OBO', registration: '5N-OBO' },
  { base: '#6b3fa0', accent: '#f6b90b', name: 'ABUJA ROYAL', registration: '5N-ABR' },
  { base: '#f4f2ec', accent: '#c62828', name: 'SKY NAIJA', registration: '5N-SKY' },
  { base: '#0b1b2b', accent: '#21d4fd', name: 'MIDNIGHT', registration: '5N-MID' },
];

function isClass(value: string | null): value is AircraftClass {
  return value !== null && (AIRCRAFT_CLASSES as readonly string[]).includes(value);
}

export function DevAviation() {
  const params = useSearchParams();
  const view = params.get('view') ?? 'lineup';
  const clsParam = params.get('cls');
  const cls: AircraftClass = isClass(clsParam) ? clsParam : 'light-jet';
  const livery: AircraftLivery = {
    base: params.get('base') ?? DEFAULT_LIVERY.base,
    accent: params.get('accent') ?? DEFAULT_LIVERY.accent,
    name: params.get('name') ?? 'AIR TOLU',
    registration: params.get('reg') ?? '5N-TOL',
  };
  const duration = Number(params.get('dur') ?? '20') * 1000;
  const quality = params.get('q') === 'low' ? 'low' : params.get('q') === 'high' ? 'high' : undefined;
  const [playing, setPlaying] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  if (view === 'flight') {
    return (
      <div className="fixed inset-0 bg-black" style={{ position: 'fixed', inset: 0, background: '#000' }}>
        <FlightSequence key={playing} cls={cls} livery={livery} durationMs={duration} from="Lagos" to="Abuja" quality={quality} onFinish={(reason) => setResult(reason)} />
        <div className="absolute bottom-10 left-4 flex items-center gap-3 text-sm text-white">
          <button type="button" className="rounded-lg bg-white/20 px-3 py-2" onClick={() => { setResult(null); setPlaying((n) => n + 1); }}>
            Replay
          </button>
          <span>{result ? `Finished: ${result}` : `${cls} · ${duration / 1000}s`}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 bg-sky-200" style={{ position: 'fixed', inset: 0, background: '#bfe3ff' }}>
      <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 42, position: view === 'apron' ? [0, 38, 52] : view === 'single' ? [AIRCRAFT_SPECS[cls].length * 0.9, AIRCRAFT_SPECS[cls].length * 0.35, AIRCRAFT_SPECS[cls].length * 0.9] : [26, 12, 30], near: 0.1, far: 400 }}>
        <color attach="background" args={['#bfe3ff']} />
        <hemisphereLight args={['#fff6e0', '#6b5a45', 1.4]} />
        <directionalLight position={[20, 40, 10]} intensity={2.6} castShadow shadow-mapSize={[1024, 1024]} />
        {view === 'apron' ? <ApronPreview /> : view === 'single' ? <Aircraft cls={cls} livery={livery} spin castShadow /> : <Lineup livery={livery} />}
        <OrbitControls target={view === 'apron' ? [0, 0, 0] : view === 'single' ? [0, 2, 0] : [0, 3, 0]} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
      <p className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-2 py-1 text-xs text-white">
        {view === 'apron' ? 'Apron: your stand + 6 others (pads)' : 'Seven classes, left to right: ' + AIRCRAFT_CLASSES.join(', ')}
      </p>
    </div>
  );
}

/** All seven classes in a row, each at 1:1 scale on its own pad, liveries cycling. */
function Lineup({ livery }: { readonly livery: AircraftLivery }) {
  // Left to right, each on its own stretch of apron (wing tip to wing tip plus a gap).
  const placed = AIRCRAFT_CLASSES.map((cls, index) => ({ cls, livery: index === 0 ? livery : (LIVERIES[index % LIVERIES.length] as AircraftLivery), at: 0 }));
  const cursor = placed.reduce((x, plane) => {
    const span = AIRCRAFT_SPECS[plane.cls].span;
    plane.at = x + span / 2 + 3;
    return x + span + 3;
  }, 0);
  const x = cursor;
  const shift = x / 2;
  return (
    <group position={[-shift, 0, 0]}>
      <mesh rotation-x={-Math.PI / 2} position={[shift, -0.01, 0]} receiveShadow>
        <planeGeometry args={[x + 40, 80]} />
        <meshStandardMaterial color="#6d7178" />
      </mesh>
      {placed.map((plane) => (
        <Aircraft key={plane.cls} cls={plane.cls} livery={plane.livery} position={[plane.at, 0, 0]} rotation={-90} spin castShadow />
      ))}
    </group>
  );
}

/** The terminal apron's layout for your plane and six mixed others. */
function ApronPreview() {
  const own: ApronPlane = { id: 'own', cls: 'midsize-jet', livery: LIVERIES[0] as AircraftLivery };
  const others = useMemo<ApronPlane[]>(
    () => (['piston-single', 'turboprop', 'light-jet', 'long-range-jet', 'piston-twin', 'midsize-jet', 'airliner-jet'] as const).map((cls, index) => ({ id: `p${index}`, cls, livery: LIVERIES[(index + 1) % LIVERIES.length] as AircraftLivery })),
    [],
  );
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[46, 30]} />
        <meshStandardMaterial color="#50555c" />
      </mesh>
      <Apron own={own} others={others} />
    </group>
  );
}
