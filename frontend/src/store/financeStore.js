import { create } from "zustand";

const useFinanceStore = create((set) => ({
  pendingCount: 0,
  setPendingCount: (n) => set({ pendingCount: n }),
  decrementPending: () => set((s) => ({ pendingCount: Math.max(0, s.pendingCount - 1) })),
}));

export default useFinanceStore;
