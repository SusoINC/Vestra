import { create } from "zustand";

const KEY = "vestra-theme"; // "system" | "dark" | "light"

export function getStoredMode() {
  return localStorage.getItem(KEY) || "system";
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function effective(mode) {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

// Aplica el tema (añade/quita la clase .light en <html>)
export function applyTheme(mode) {
  const isLight = effective(mode) === "light";
  document.documentElement.classList.toggle("light", isLight);
}

const useThemeStore = create((set) => ({
  mode: getStoredMode(),
  setMode: (mode) => {
    localStorage.setItem(KEY, mode);
    applyTheme(mode);
    set({ mode });
  },
}));

// Reacciona a cambios del sistema cuando el modo es "system"
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (getStoredMode() === "system") applyTheme("system");
});

export default useThemeStore;
