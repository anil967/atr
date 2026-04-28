import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => {
        set({ theme });
        updateThemeClass(theme);
      },
      toggleTheme: () => {
        set((state) => {
          const next = state.theme === "light" ? "dark" : "light";
          updateThemeClass(next);
          return { theme: next };
        });
      },
    }),
    {
      name: "bcet-theme-storage",
      onRehydrateStorage: () => (state) => {
        if (state) updateThemeClass(state.theme);
      },
    }
  )
);

function updateThemeClass(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}
