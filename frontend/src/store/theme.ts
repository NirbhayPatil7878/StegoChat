import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system";
export type Accent = "violet" | "cyan" | "blue" | "emerald" | "rose" | "grey";

interface ThemeState {
  theme: ThemeMode;
  accent: Accent;
  animations: boolean;
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: Accent) => void;
  setAnimations: (v: boolean) => void;
}

function resolve(theme: ThemeMode): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

export function applyTheme(theme: ThemeMode, accent: Accent) {
  const root = document.documentElement;
  const resolved = resolve(theme);
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.setAttribute("data-accent", accent);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      accent: "violet",
      animations: true,
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme, get().accent);
      },
      setAccent: (accent) => {
        set({ accent });
        applyTheme(get().theme, accent);
      },
      setAnimations: (animations) => set({ animations }),
    }),
    { name: "stego-theme" },
  ),
);
