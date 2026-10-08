import { Bone, Skeleton, SkinnedMesh, Sphere, Vector3, type CanvasTexture, type Material, type MeshStandardMaterial } from 'three';
import { RefCountCache } from '../core/refcount-cache';
import { timed } from '../core/perf-marks';
import { acquireFabric, releaseFabric } from '../materials/fabric-textures';
import { createSurfaceMaterial } from '../materials/surface-material';
import { AvatarAnimator, type FaceState } from './animation/animator';
import { avatarBuildKey, buildAvatar, type AvatarBuild, type AvatarBuildInput } from './build/build-avatar';
import { FACE_GRID, acquireFaceAtlas, faceAtlasKey, faceCellOffset, releaseFaceAtlas } from './face';
import { BONE_NAMES, BONE_PARENT, type BoneName, type RigMetrics } from './rig';

/** Named attachment points (bones) for held items, hats, vehicles… */
export const AVATAR_SOCKETS = ['root', 'hips', 'chest', 'head', 'handL', 'handR', 'footL', 'footR'] as const;
export type AvatarSocket = (typeof AVATAR_SOCKETS)[number];

export interface AvatarParts {
  readonly mesh: SkinnedMesh;
  readonly skeleton: Skeleton;
  readonly sockets: Readonly<Record<AvatarSocket, Bone>>;
  readonly rig: RigMetrics;
}

// ---------------------------------------------------------------------------------------------------------------
// Shared geometry cache (one merged geometry per distinct look, shared by every avatar wearing it)
// ---------------------------------------------------------------------------------------------------------------

const pendingInputs = new Map<string, AvatarBuildInput>();

const buildCache = new RefCountCache<AvatarBuild>({
  create: (key) => {
    const input = pendingInputs.get(key);
    pendingInputs.delete(key);
    if (!input) throw new Error(`Missing avatar build input for ${key}`);
    return timed('il:avatar-build', () => buildAvatar(input));
  },
  dispose: (build) => build.geometry.dispose(),
  graceMs: 5000,
});

/** True if this look's geometry is already built (instances of it mount for free). */
export function isAvatarBuilt(input: AvatarBuildInput): boolean {
  return buildCache.peek(avatarBuildKey(input)) !== undefined;
}

/**
 * Do the expensive part of a new look ahead of mounting (geometry, prints, face atlas) so the render that mounts it
 * is cheap. Caches keep the results for a few seconds; the mounting instance takes its own references.
 */
export function prebuildAvatar(input: AvatarBuildInput, lashes: boolean): void {
  const key = avatarBuildKey(input);
  if (!buildCache.peek(key)) pendingInputs.set(key, input);
  const build = buildCache.obtain(key);
  for (const spec of build.fabrics.values()) releaseFabric(acquireFabric(spec).key);
  if (build.slots.includes('face')) {
    const faceKey = faceAtlasKey(input.appearance.eyeStyle, lashes);
    acquireFaceAtlas(faceKey);
    releaseFaceAtlas(faceKey);
  }
}

let baseMaterial: MeshStandardMaterial | null = null;

/** The one material every avatar's untextured parts share (skin, hair, solids, metal — per-vertex surface). */
export function avatarBaseMaterial(): MeshStandardMaterial {
  if (!baseMaterial) {
    baseMaterial = createSurfaceMaterial();
    baseMaterial.name = 'avatar-base';
  }
  return baseMaterial;
}

let instanceCounter = 0;

/**
 * One rendered avatar: its own skeleton, mesh and animator over shared geometry/materials.
 *
 * Lifecycle is reference counted so React StrictMode (double render, mount → unmount → mount) never disposes an
 * instance that is still on screen: `retain()` in an effect, `release()` in its cleanup. An instance that is never
 * retained (a discarded render) disposes itself after a short timeout.
 */
export class AvatarInstance {
  readonly key: string;
  readonly mesh: SkinnedMesh;
  readonly skeleton: Skeleton;
  readonly bones: readonly Bone[];
  readonly animator: AvatarAnimator;
  readonly parts: AvatarParts;
  readonly build: AvatarBuild;
  private readonly fabricKeys: string[] = [];
  private readonly faceKey: string | null;
  private readonly faceTexture: CanvasTexture | null;
  private readonly faceMaterial: MeshStandardMaterial | null;
  private face: FaceState | null = null;
  private refs = 0;
  private disposeTimer: ReturnType<typeof setTimeout> | null;
  private disposed = false;

  constructor(input: AvatarBuildInput, options: { readonly seed?: number; readonly lashes: boolean }) {
    this.key = avatarBuildKey(input);
    if (!buildCache.peek(this.key)) pendingInputs.set(this.key, input);
    this.build = buildCache.acquire(this.key);
    const { rig } = this.build;

    // Skeleton (bind pose: identity rotations, positions from the rig).
    const bones = BONE_NAMES.map((name) => {
      const bone = new Bone();
      bone.name = name;
      return bone;
    });
    BONE_NAMES.forEach((name, index) => {
      const parent = BONE_PARENT[name];
      const bone = bones[index]!;
      const [x, y, z] = rig.bones[name];
      if (parent) {
        const [px, py, pz] = rig.bones[parent];
        bone.position.set(x - px, y - py, z - pz);
        bones[BONE_NAMES.indexOf(parent)]!.add(bone);
      } else bone.position.set(x, y, z);
    });
    this.bones = bones;

    // Materials per geometry group.
    let faceTexture: CanvasTexture | null = null;
    let faceMaterial: MeshStandardMaterial | null = null;
    let faceKey: string | null = null;
    const materials: Material[] = this.build.slots.map((slot) => {
      if (slot === 'base') return avatarBaseMaterial();
      if (slot === 'face') {
        faceKey = faceAtlasKey(input.appearance.eyeStyle, options.lashes);
        const atlas = acquireFaceAtlas(faceKey);
        faceTexture = atlas.clone();
        faceTexture.repeat.set(1 / FACE_GRID, 1 / FACE_GRID);
        faceTexture.needsUpdate = true;
        faceMaterial = createSurfaceMaterial({ map: faceTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
        faceMaterial.name = 'avatar-face';
        return faceMaterial;
      }
      const spec = this.build.fabrics.get(slot);
      if (!spec) return avatarBaseMaterial();
      const { key, resource } = acquireFabric(spec);
      this.fabricKeys.push(key);
      return resource.material;
    });
    this.faceKey = faceKey;
    this.faceTexture = faceTexture;
    this.faceMaterial = faceMaterial;

    const mesh = new SkinnedMesh(this.build.geometry, materials);
    mesh.name = 'avatar';
    mesh.add(bones[0]!);
    mesh.updateMatrixWorld(true);
    this.skeleton = new Skeleton(bones);
    mesh.bind(this.skeleton);
    // Generous bounds that cover every pose (lying down, arms up) so culling never pops.
    mesh.boundingSphere = new Sphere(new Vector3(0, 0.7, 0), 1.3);
    mesh.frustumCulled = true;
    this.mesh = mesh;

    const seed = options.seed ?? (instanceCounter = (instanceCounter + 0x9e3779b9) >>> 0);
    this.animator = new AvatarAnimator(bones, rig, seed);
    const socket = (name: BoneName): Bone => bones[BONE_NAMES.indexOf(name)]!;
    this.parts = {
      mesh,
      skeleton: this.skeleton,
      rig,
      sockets: {
        root: socket('root'),
        hips: socket('hips'),
        chest: socket('chest'),
        head: socket('head'),
        handL: socket('handL'),
        handR: socket('handR'),
        footL: socket('footL'),
        footR: socket('footR'),
      },
    };
    this.disposeTimer = setTimeout(() => {
      if (this.refs === 0) this.dispose();
    }, 4000);
  }

  retain(): void {
    this.refs += 1;
    if (this.disposeTimer !== null) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = null;
    }
  }

  release(): void {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs > 0) return;
    // Defer: StrictMode re-mounts immediately and re-retains.
    this.disposeTimer = setTimeout(() => {
      if (this.refs === 0) this.dispose();
    }, 0);
  }

  setShadow(cast: boolean): void {
    this.mesh.castShadow = cast;
  }

  /** Advance animation; updates the face atlas cell only when the face actually changes. */
  update(delta: number, elapsed: number): void {
    if (this.disposed) return;
    const face = this.animator.update(delta, elapsed);
    if (face !== this.face && this.faceTexture) {
      const [u, v] = faceCellOffset(face);
      this.faceTexture.offset.set(u, v);
    }
    this.face = face;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.skeleton.dispose();
    this.faceTexture?.dispose();
    this.faceMaterial?.dispose();
    if (this.faceKey) releaseFaceAtlas(this.faceKey);
    for (const key of this.fabricKeys) releaseFabric(key);
    buildCache.release(this.key);
  }
}
