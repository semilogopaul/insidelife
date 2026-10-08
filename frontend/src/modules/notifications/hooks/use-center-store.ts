'use client';

import { create } from 'zustand';

interface CenterState {
  readonly open: boolean;
  setOpen(open: boolean): void;
}

/** Whether the notification centre sheet is open (client UI state, local to this feature). */
export const useNotificationCenterStore = create<CenterState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
