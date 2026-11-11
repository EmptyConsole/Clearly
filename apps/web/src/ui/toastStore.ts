import { create } from 'zustand';

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly action?: { readonly label: string; readonly run: () => void };
}

interface ToastState {
  readonly toasts: readonly Toast[];
  show: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let next = 1;
/** Toasts are rare (RULES.md): a gentle message with at most one action, role status. */
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  show: (t) => {
    set({ toasts: [...get().toasts, { ...t, id: next++ }] });
  },
  dismiss: (id) => {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },
}));
