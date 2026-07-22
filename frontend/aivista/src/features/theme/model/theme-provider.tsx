"use client";

import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const THEME_STORAGE_KEY = "aivista-theme-preference";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function applyTheme(preference: ThemePreference, disableTransitions = false) {
  const root = document.documentElement;
  const isDark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (disableTransitions) root.classList.add("theme-changing");
  root.classList.toggle("dark", isDark);

  if (disableTransitions) {
    window.requestAnimationFrame(() => root.classList.remove("theme-changing"));
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setStoredPreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "light";
    const savedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(savedPreference) ? savedPreference : "light";
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => applyTheme(preference);

    applyTheme(preference);

    if (preference !== "system") return;
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    applyTheme(nextPreference, true);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    setStoredPreference(nextPreference);
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const value = use(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return value;
}
