/** Procedural Lagos props (built in `render/proc-geometry.ts`), sized in metres at scale 1. */
export const PROC_MODEL_IDS = ['stall', 'hut', 'shelter', 'flagpole', 'keke', 'kiosk'] as const;
export type ProcModelId = (typeof PROC_MODEL_IDS)[number];

export const PROC_MODELS: Readonly<Record<ProcModelId, { readonly size: readonly [number, number, number] }>> = {
  stall: { size: [2.6, 2.4, 1.8] },
  hut: { size: [3.2, 3, 3.2] },
  shelter: { size: [20, 3.2, 2.6] },
  flagpole: { size: [0.4, 8, 0.4] },
  keke: { size: [1.3, 1.75, 2.6] },
  kiosk: { size: [2.2, 2.6, 1.8] },
};
