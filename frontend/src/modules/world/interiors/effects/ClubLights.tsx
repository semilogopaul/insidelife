'use client';

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BoxGeometry, Color, ConeGeometry, IcosahedronGeometry, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3, type InstancedMesh, type Mesh, type PointLight } from 'three';

export interface ClubLightsProps {
  /** Dance floor centre and size (tiles are 0.6 m). */
  readonly floor: { readonly at: readonly [number, number]; readonly size: readonly [number, number] };
  readonly ceiling: number;
  /** Beat-synced intensity 0-1 (respect reduced motion by passing a lower value). */
  readonly energy?: number;
}

const PALETTE = ['#ff2fb1', '#21d4fd', '#f6b90b', '#7c4dff', '#00e676'].map((hex) => new Color(hex));
const TILE = 0.6;
const BPM = 112;

/** Animated dance floor, sweeping beams, a disco ball and two coloured lights — about four draw calls. */
export function ClubLights({ floor, ceiling, energy = 1 }: ClubLightsProps) {
  const cols = Math.max(2, Math.round(floor.size[0] / TILE));
  const rows = Math.max(2, Math.round(floor.size[1] / TILE));
  const tiles = useRef<InstancedMesh>(null);
  const beams = useRef<InstancedMesh>(null);
  const ball = useRef<Mesh>(null);
  const lightA = useRef<PointLight>(null);
  const lightB = useRef<PointLight>(null);

  const resources = useMemo(() => {
    const tileGeometry = new BoxGeometry(TILE * 0.94, 0.03, TILE * 0.94);
    const tileMaterial = new MeshBasicMaterial({ toneMapped: false });
    const beamGeometry = new ConeGeometry(0.55, ceiling * 1.05, 20, 1, true);
    beamGeometry.translate(0, -ceiling * 0.525, 0);
    const beamMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0.14, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const ballGeometry = new IcosahedronGeometry(0.26, 2);
    const ballMaterial = new MeshStandardMaterial({ color: '#d8dde3', metalness: 1, roughness: 0.15, flatShading: true });
    return { tileGeometry, tileMaterial, beamGeometry, beamMaterial, ballGeometry, ballMaterial };
  }, [ceiling]);
  useLayoutEffect(
    () => () => {
      for (const resource of Object.values(resources)) resource.dispose();
    },
    [resources],
  );

  useLayoutEffect(() => {
    const mesh = tiles.current;
    if (!mesh) return;
    const m = new Matrix4();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        m.makeTranslation(floor.at[0] + (c - (cols - 1) / 2) * TILE, 0.015, floor.at[1] + (r - (rows - 1) / 2) * TILE);
        mesh.setMatrixAt(r * cols + c, m);
        mesh.setColorAt(r * cols + c, PALETTE[(r + c) % PALETTE.length]!);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [cols, rows, floor.at]);

  const color = useMemo(() => new Color(), []);
  const m = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  const axis = useMemo(() => new Vector3(), []);
  const one = useMemo(() => new Vector3(1, 1, 1), []);
  const origin = useMemo(() => new Vector3(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const beat = t * (BPM / 60);
    const pulse = Math.pow(1 - (beat % 1), 3);
    const mesh = tiles.current;
    if (mesh) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wave = Math.sin((c + r) * 0.9 - beat * Math.PI) * 0.5 + 0.5;
          const index = (Math.floor(beat / 4) + c + r * 2) % PALETTE.length;
          color.copy(PALETTE[index]!).multiplyScalar((0.25 + 0.75 * wave * (0.6 + 0.4 * pulse)) * energy + 0.08);
          mesh.setColorAt(r * cols + c, color);
        }
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const beamMesh = beams.current;
    if (beamMesh) {
      for (let i = 0; i < 4; i++) {
        const sway = Math.sin(t * 0.7 + i * 1.7) * 0.45;
        const spin = Math.cos(t * 0.5 + i * 2.1) * 0.45;
        axis.set(Math.cos(spin), 0, Math.sin(spin)).normalize();
        q.setFromAxisAngle(axis, sway);
        origin.set(floor.at[0] + (i - 1.5) * (floor.size[0] / 3.2), ceiling - 0.05, floor.at[1] - floor.size[1] * 0.2);
        m.compose(origin, q, one);
        beamMesh.setMatrixAt(i, m);
        beamMesh.setColorAt(i, color.copy(PALETTE[(i + Math.floor(beat / 8)) % PALETTE.length]!).multiplyScalar(0.6 + 0.4 * pulse * energy));
      }
      beamMesh.instanceMatrix.needsUpdate = true;
      if (beamMesh.instanceColor) beamMesh.instanceColor.needsUpdate = true;
    }
    if (ball.current) ball.current.rotation.y = t * 0.6;
    if (lightA.current) {
      lightA.current.color.copy(PALETTE[Math.floor(beat / 2) % PALETTE.length]!);
      lightA.current.intensity = (4 + 6 * pulse) * energy;
    }
    if (lightB.current) {
      lightB.current.color.copy(PALETTE[(Math.floor(beat / 2) + 2) % PALETTE.length]!);
      lightB.current.intensity = (4 + 6 * (1 - pulse)) * energy;
    }
  });

  return (
    <group name="club-lights">
      <instancedMesh ref={tiles} args={[resources.tileGeometry, resources.tileMaterial, cols * rows]} frustumCulled={false} />
      <instancedMesh ref={beams} args={[resources.beamGeometry, resources.beamMaterial, 4]} frustumCulled={false} renderOrder={2} />
      <mesh ref={ball} geometry={resources.ballGeometry} material={resources.ballMaterial} position={[floor.at[0], ceiling - 0.45, floor.at[1]]} />
      <pointLight ref={lightA} position={[floor.at[0] - floor.size[0] / 3, ceiling - 0.4, floor.at[1]]} distance={9} decay={1.5} />
      <pointLight ref={lightB} position={[floor.at[0] + floor.size[0] / 3, ceiling - 0.4, floor.at[1]]} distance={9} decay={1.5} />
    </group>
  );
}
