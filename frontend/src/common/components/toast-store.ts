import { create } from 'zustand';

export interface Toast {
  readonly id: number;
  readonly title: string;
  readonly body?: string;
  readonly tone: 'good' | 'bad' | 'neutral';
  readonly amount?: number;
}

interface ToastState {
  readonly toasts: readonly Toast[];
  push(toast: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { ...toast, id }] }));
    window.setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), 5_000);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Fire-and-forget toast from anywhere (outside React too). */
export const toast = (t: Omit<Toast, 'id'>): void => useToasts.getState().push(t);
