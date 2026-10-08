/**
 * three.js objects are engine state that the render loop mutates every frame. React's immutability lint can't tell
 * them apart from React state when they come from `useMemo`, so per-frame writes go through these helpers.
 */

/** Assigns properties on a three.js object (material, light, mesh…). */
export function setProps<T extends object>(target: T, patch: Partial<T>): void {
  Object.assign(target, patch);
}

interface UniformHolder {
  readonly uniforms: Record<string, { value: unknown }>;
}

/** Sets a shader uniform value (no-op when the uniform does not exist). */
export function setUniform(material: UniformHolder, name: string, value: unknown): void {
  const uniform = material.uniforms[name];
  if (uniform) uniform.value = value;
}
