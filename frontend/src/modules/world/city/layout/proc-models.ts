/** Procedural Lagos props (built in `render/proc-geometry.ts`), sized in metres at scale 1. */
export const PROC_MODEL_IDS = ['stall', 'hut', 'shelter', 'flagpole', 'keke', 'kiosk', 'fuel-station', 'workshop'] as const;
export type ProcModelId = (typeof PROC_MODEL_IDS)[number];

export const PROC_MODELS: Readonly<Record<ProcModelId, { readonly size: readonly [number, number, number] }>> = {
  stall: { size: [2.6, 2.4, 1.8] },
  hut: { size: [3.2, 3, 3.2] },
  shelter: { size: [20, 3.2, 2.6] },
  flagpole: { size: [0.4, 8, 0.4] },
  keke: { size: [1.3, 1.75, 2.6] },
  kiosk: { size: [2.2, 2.6, 1.8] },
  /** Pump canopy with two pump islands and the price board (a filling station's forecourt). */
  'fuel-station': { size: [8.4, 5.4, 4.8] },
  /** Open mechanic shed with a workbench, tyre stacks and a red board. */
  workshop: { size: [6.4, 3.4, 4.4] },
};
