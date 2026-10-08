import { MeshStandardMaterial, type Texture, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * The city's material kit. Every Kenney kit shares one material (one draw call per kit) patched with
 * `onBeforeCompile`:
 * - warm grade: Kenney's neutral greys lean blue-violet; we pull them to sun-baked Lagos plaster/concrete,
 * - wall tint: per-building colour (BatchedMesh colour) applied to bright neutral texels only (not glass/trim),
 * - roofs: the suburban kit's green roofs become long-span aluminium in rust/maroon/blue/teal per building,
 * - night: window texels light up (warm/cool, ~55% of rooms) from `uIlNight`,
 * - rain: darker albedo and glossy surfaces from `uIlWet`.
 * Uniforms are shared objects, so one write per frame updates every material.
 */

export const cityUniforms = {
  uIlNight: { value: 0 },
  uIlWet: { value: 0 },
  uIlTime: { value: 0 },
};

export type CityMaterialRole = 'buildings' | 'roads' | 'vehicles' | 'foliage' | 'ground' | 'props';

const COMMON_VERTEX_PARS = /* glsl */ `
varying vec3 vIlWorld;
varying float vIlSeed;
uniform float uIlTime;
`;

const COMMON_VERTEX_MAIN = /* glsl */ `
{
  vec4 ilW = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    ilW = batchingMatrix * ilW;
    vIlSeed = getIndirectIndex( gl_DrawID );
  #else
    vIlSeed = 0.0;
  #endif
  #ifdef USE_INSTANCING
    ilW = instanceMatrix * ilW;
  #endif
  vIlWorld = ( modelMatrix * ilW ).xyz;
}
`;

const SWAY_VERTEX = /* glsl */ `
#include <begin_vertex>
{
  float ilH = max( position.y, 0.0 );
  vec4 ilOrigin = vec4( 0.0, 0.0, 0.0, 1.0 );
  #ifdef USE_BATCHING
    ilOrigin = batchingMatrix * ilOrigin;
  #endif
  float ilPhase = ilOrigin.x * 0.13 + ilOrigin.z * 0.11;
  transformed.x += sin( uIlTime * 1.3 + ilPhase ) * 0.012 * ilH * ilH;
  transformed.z += cos( uIlTime * 1.1 + ilPhase ) * 0.008 * ilH * ilH;
}
`;

const COMMON_FRAGMENT_PARS = /* glsl */ `
varying vec3 vIlWorld;
varying float vIlSeed;
uniform float uIlNight;
uniform float uIlWet;
float ilHash( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.yzx + 33.33 );
  return fract( ( p.x + p.y ) * p.z );
}
float ilNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = ilHash( vec3( i, 0.0 ) );
  float b = ilHash( vec3( i + vec2( 1.0, 0.0 ), 0.0 ) );
  float c = ilHash( vec3( i + vec2( 0.0, 1.0 ), 0.0 ) );
  float d = ilHash( vec3( i + vec2( 1.0, 1.0 ), 0.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
`;

/** Shared texel analysis: neutral (low saturation) and glass (light blue) masks, warm grade. */
const TEXEL_ANALYSIS = /* glsl */ `
vec3 ilTex = diffuseColor.rgb;
float ilMax = max( max( ilTex.r, ilTex.g ), ilTex.b );
float ilMin = min( min( ilTex.r, ilTex.g ), ilTex.b );
float ilSat = ( ilMax - ilMin ) / max( ilMax, 0.001 );
float ilLum = dot( ilTex, vec3( 0.2126, 0.7152, 0.0722 ) );
// Kenney window glass is #7ea6e1 (linear b - r ≈ 0.54, g ≈ 0.38); lavender plaster (b - r ≈ 0.23) and deep blue
// paint (g ≈ 0.30) stay out.
float ilGlass = smoothstep( 0.34, 0.46, ilTex.b - ilTex.r ) * smoothstep( 0.31, 0.36, ilTex.g );
`;

const BUILDINGS_COLOR = /* glsl */ `
${TEXEL_ANALYSIS}
// Saturation is measured in linear space, where Kenney's blue-greys read ~0.4; true colours sit above 0.6.
float ilNeutral = ( 1.0 - smoothstep( 0.42, 0.64, ilSat ) ) * ( 1.0 - ilGlass );
diffuseColor.rgb = mix( ilTex, ilLum * vec3( 1.08, 1.0, 0.86 ), ilNeutral * 0.9 );
float ilWall = ilNeutral * smoothstep( 0.22, 0.5, ilLum ) * ( 1.0 - ilGlass );
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vColor.rgb, ilWall );
#endif
// Green roofs/awnings → long-span aluminium colours per building.
float ilRoof = smoothstep( 0.08, 0.22, ilTex.g - max( ilTex.r, ilTex.b ) );
float ilPick = fract( vIlSeed * 0.618034 + 0.13 );
vec3 ilRoofCol = ilPick < 0.3 ? vec3( 0.42, 0.11, 0.06 ) : ilPick < 0.5 ? vec3( 0.33, 0.16, 0.08 ) : ilPick < 0.68 ? vec3( 0.16, 0.25, 0.33 ) : ilPick < 0.84 ? vec3( 0.08, 0.27, 0.25 ) : vec3( 0.3, 0.07, 0.07 );
diffuseColor.rgb = mix( diffuseColor.rgb, ilRoofCol * ( 0.55 + ilMax ), ilRoof );
// Night windows: ~55% of rooms lit, warm tungsten or cool LED; unlit glass goes dark.
// Rooms: ~2.4 m bays along the facade (x + z works for both facade orientations without flooring a constant
// coordinate, which would flicker) × 2.9 m storeys.
vec3 ilCell = vec3( floor( ( vIlWorld.x + vIlWorld.z ) * 0.42 ), floor( vIlWorld.y * 0.34 ), vIlSeed * 7.13 );
float ilRoom = ilHash( ilCell );
float ilOn = step( 0.45, ilRoom );
vec3 ilRoomLight = mix( vec3( 1.0, 0.62, 0.3 ), vec3( 0.92, 0.9, 0.82 ), step( 0.8, ilRoom ) );
diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.3, ilGlass * uIlNight );
diffuseColor.rgb *= 1.0 - 0.16 * uIlWet;
`;

const ROADS_COLOR = /* glsl */ `
${TEXEL_ANALYSIS}
float ilNeutral = 1.0 - smoothstep( 0.45, 0.66, ilSat );
vec3 ilGraded = ilLum * vec3( 1.06, 1.0, 0.88 );
// Asphalt: dusty, sun-bleached, with patches.
float ilAsphalt = 1.0 - smoothstep( 0.05, 0.12, ilLum );
float ilPatch = ilNoise( vIlWorld.xz * 0.11 ) * 0.6 + ilNoise( vIlWorld.xz * 0.5 ) * 0.4;
ilGraded *= mix( 1.0, 0.78 + ilPatch * 0.38, ilAsphalt );
diffuseColor.rgb = mix( ilTex, ilGraded, ilNeutral );
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  diffuseColor.rgb *= vColor.rgb;
#endif
diffuseColor.rgb *= 1.0 - 0.32 * uIlWet;
float ilOn = 0.0;
vec3 ilRoomLight = vec3( 0.0 );
`;

const VEHICLES_COLOR = /* glsl */ `
${TEXEL_ANALYSIS}
float ilNeutral = ( 1.0 - smoothstep( 0.42, 0.64, ilSat ) ) * ( 1.0 - ilGlass );
diffuseColor.rgb = mix( ilTex, ilLum * vec3( 1.05, 1.0, 0.92 ), ilNeutral * 0.7 );
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  diffuseColor.rgb *= vColor.rgb;
#endif
diffuseColor.rgb *= 1.0 - 0.12 * uIlWet;
float ilOn = 0.0;
vec3 ilRoomLight = vec3( 0.0 );
`;

const VERTEX_COLOR_COLOR = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  diffuseColor.rgb *= vColor.rgb;
#endif
float ilGlass = 0.0;
float ilOn = 0.0;
vec3 ilRoomLight = vec3( 0.0 );
#ifdef IL_GROUND
  float ilN = ilNoise( vIlWorld.xz * 0.07 ) * 0.55 + ilNoise( vIlWorld.xz * 0.31 ) * 0.3 + ilNoise( vIlWorld.xz * 1.7 ) * 0.15;
  diffuseColor.rgb *= 0.86 + ilN * 0.26;
#endif
diffuseColor.rgb *= 1.0 - 0.25 * uIlWet;
`;

/**
 * Geometry close to the lens dissolves (ordered 4×4 dither, still opaque: no sorting, no overdraw): hidden within
 * `near` metres, solid beyond `far`. Foliage fades early so a tree between the third-person camera and the player
 * never fills the screen; props (gate beams, walls, billboard frames) only when the camera is about to clip them.
 * The shadow pass uses its own depth material, so their shade stays.
 */
const nearFade = (near: number, far: number): string => /* glsl */ `
#include <alphatest_fragment>
{
  const float IL_BAYER[16] = float[16]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
  ivec2 ilCell = ivec2( mod( gl_FragCoord.xy, 4.0 ) );
  float ilThreshold = ( IL_BAYER[ ilCell.x + ilCell.y * 4 ] + 0.5 ) / 16.0;
  if ( smoothstep( ${near.toFixed(1)}, ${far.toFixed(1)}, distance( vIlWorld, cameraPosition ) ) < ilThreshold ) discard;
}
`;

const NEAR_FADE: Readonly<Partial<Record<CityMaterialRole, string>>> = {
  foliage: nearFade(2.5, 7),
  props: nearFade(1, 3),
};

const ROUGHNESS = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix( roughnessFactor, 0.18, ilGlass );
roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.35, uIlWet );
`;

const EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += ilGlass * ilOn * uIlNight * ilRoomLight * 1.1;
`;

const ROLE_COLOR: Readonly<Record<CityMaterialRole, string>> = {
  buildings: BUILDINGS_COLOR,
  roads: ROADS_COLOR,
  vehicles: VEHICLES_COLOR,
  foliage: VERTEX_COLOR_COLOR,
  ground: VERTEX_COLOR_COLOR,
  props: VERTEX_COLOR_COLOR,
};

function patch(material: MeshStandardMaterial, role: CityMaterialRole): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uIlNight = cityUniforms.uIlNight;
    shader.uniforms.uIlWet = cityUniforms.uIlWet;
    shader.uniforms.uIlTime = cityUniforms.uIlTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${COMMON_VERTEX_MAIN}`);
    if (role === 'foliage') shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', SWAY_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_FRAGMENT_PARS}${role === 'ground' ? '\n#define IL_GROUND' : ''}`)
      .replace('#include <color_fragment>', ROLE_COLOR[role])
      .replace('#include <roughnessmap_fragment>', ROUGHNESS)
      .replace('#include <emissivemap_fragment>', EMISSIVE);
    const fade = NEAR_FADE[role];
    if (fade) shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', fade);
  };
  material.customProgramCacheKey = () => `il-city-${role}`;
}

/** The near-camera dissolve for a material outside the kit (sign boards); `near`/`far` in metres. */
export function addNearFade(material: MeshStandardMaterial, key: string, near: number, far: number): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uIlTime = cityUniforms.uIlTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${COMMON_VERTEX_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vIlWorld;')
      .replace('#include <alphatest_fragment>', nearFade(near, far));
  };
  material.customProgramCacheKey = () => `il-near-fade-${key}`;
}

/** One material per role; textured kits pass their colormap. */
export function createCityMaterial(role: CityMaterialRole, map: Texture | null): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map,
    vertexColors: role === 'foliage' || role === 'props',
    roughness: role === 'vehicles' ? 0.5 : role === 'roads' ? 0.92 : role === 'foliage' ? 0.85 : 0.82,
    metalness: 0,
    envMapIntensity: role === 'vehicles' ? 1.1 : 0.7,
  });
  material.name = `city-${role}`;
  patch(material, role);
  return material;
}
