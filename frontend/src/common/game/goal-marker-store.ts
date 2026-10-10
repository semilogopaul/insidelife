'use client';

import { create } from 'zustand';
import type { WorldPoint } from '@insidelife/shared';

interface GoalMarkerState {
  /** Where the current Life Goal's next step is (a venue door), or null when the step isn't a place. */
  readonly point: WorldPoint | null;
  readonly name: string | null;
  set(point: WorldPoint | null, name?: string | null): void;
}

/** The current Life Goal's place: published by the goal guide, drawn by the minimap (read per frame, no React). */
export const useGoalMarker = create<GoalMarkerState>()((set) => ({
  point: null,
  name: null,
  set: (point, name = null) => set({ point, name: point ? name : null }),
}));
