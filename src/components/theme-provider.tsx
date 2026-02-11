"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemeId = "cyan" | "ember" | "neon" | "rose" | "coral" | "gradient";

export interface Theme {
  id: ThemeId;
  name: string;
  primary: string;
  primaryRgb: string;
  accent: string;
  macroProtein: string;
  macroCarbs: string;
  macroFat: string;
}

export const themes: Theme[] = [
  {
    id: "cyan",
    name: "Electric Cyan",
    primary: "#06b6d4",
    primaryRgb: "6, 182, 212",
    accent: "#22d3ee",
    macroProtein: "#a78bfa",
    macroCarbs: "#06b6d4",
    macroFat: "#f472b6",
  },
  {
    id: "ember",
    name: "Ember",
    primary: "#f97316",
    primaryRgb: "249, 115, 22",
    accent: "#fb923c",
    macroProtein: "#22c55e",
    macroCarbs: "#f97316",
    macroFat: "#fbbf24",
  },
  {
    id: "neon",
    name: "Neon Green",
    primary: "#22c55e",
    primaryRgb: "34, 197, 94",
    accent: "#4ade80",
    macroProtein: "#22c55e",
    macroCarbs: "#3b82f6",
    macroFat: "#f59e0b",
  },
  {
    id: "rose",
    name: "Rose",
    primary: "#e11d48",
    primaryRgb: "225, 29, 72",
    accent: "#f43f5e",
    macroProtein: "#22c55e",
    macroCarbs: "#6366f1",
    macroFat: "#f59e0b",
  },
  {
    id: "coral",
    name: "Coral",
    primary: "#ff4757",
    primaryRgb: "255, 71, 87",
    accent: "#ff6b7a",
    macroProtein: "#22c55e",
    macroCarbs: "#3b82f6",
    macroFat: "#eab308",
  },
  {
    id: "gradient",
    name: "Ultraviolet",
    primary: "#a855f7",
    primaryRgb: "168, 85, 247",
    accent: "#ec4899",
    macroProtein: "#22c55e",
    macroCarbs: "#a855f7",
    macroFat: "#f59e0b",
  },
];

const DEFAULT_THEME: ThemeId = "cyan";

type ThemeContextType = {
  theme: Theme;
  setTheme: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: themes.find((t) => t.id === DEFAULT_THEME)!,
  setTheme: () => {},
});

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-rgb", theme.primaryRgb);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--macro-protein", theme.macroProtein);
  root.style.setProperty("--macro-carbs", theme.macroCarbs);
  root.style.setProperty("--macro-fat", theme.macroFat);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    themes.find((t) => t.id === DEFAULT_THEME)!
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Load saved theme from localStorage
    const saved = localStorage.getItem("netgains-theme") as ThemeId | null;
    const savedTheme = themes.find((t) => t.id === saved);
    if (savedTheme) {
      setThemeState(savedTheme);
      applyTheme(savedTheme);
    } else {
      applyTheme(theme);
    }
    setMounted(true);
  }, []);

  const setTheme = (id: ThemeId) => {
    const newTheme = themes.find((t) => t.id === id);
    if (newTheme) {
      setThemeState(newTheme);
      applyTheme(newTheme);
      localStorage.setItem("netgains-theme", id);
    }
  };

  // Prevent flash of default theme
  if (!mounted) {
    return (
      <ThemeContext.Provider value={{ theme, setTheme }}>
        <div style={{ visibility: "hidden" }}>{children}</div>
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
