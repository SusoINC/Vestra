import { create } from "zustand";

const useAuthStore = create((set) => ({
  user: null,
  accessToken: localStorage.getItem("access_token") || null,
  isLoading: false,

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    set({ user, accessToken });
  },

  setUser: (user) => set({ user }),

  clearAuth: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, accessToken: null });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));

export default useAuthStore;
