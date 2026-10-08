import { MeshStandardMaterial, type MeshStandardMaterialParameters } from 'three';

/**
 * MeshStandardMaterial that reads per-vertex surface parameters baked by `PartBuilder`:
 * - `color` (normalised bytes, sRGB-encoded → decoded to linear in the vertex shader, no 8-bit banding in the darks)
 * - `surface` (vec2: roughness, metalness)
 *
 * One material can therefore render skin, cloth, leather, gold and glass in a single draw call. `roughness` on the
 * material multiplies the baked value; `metalness` is a floor (adds sheen to e.g. aso-oke).
 */
const VERTEX_PARS = /* glsl */ `
attribute vec2 surface;
varying vec2 vSurface;
vec3 decodeStoredColor( vec3 c ) {
  return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) );
}
`;

const COLOR_VERTEX = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR
  vColor.rgb *= decodeStoredColor( color );
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= instanceColor.rgb;
#endif
vSurface = surface;
`;

export type SurfaceMaterialParameters = Omit<MeshStandardMaterialParameters, 'vertexColors'>;

export function createSurfaceMaterial(parameters: SurfaceMaterialParameters = {}): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 1, metalness: 0, ...parameters, vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <color_vertex>', COLOR_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSurface;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp( vSurface.x * roughness, 0.04, 1.0 );')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = max( vSurface.y, metalness );');
  };
  material.customProgramCacheKey = () => 'il-surface-v1';
  return material;
}
