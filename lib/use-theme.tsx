'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { useProfile } from './use-profile';

type Theme = 'dark' | 'light' | 'system';

type Ctx = {
  theme: Theme;
  resolved: 'dark' | 'light';
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const [theme, setThemeState] = useState<Theme>('dark');
  const [systemDark, setSystemDark] = useState(false);

  // Watch OS preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Sync from profile whenever it changes
  useEffect(() => {
    const t = (profile as any)?.theme as Theme | undefined;
    if (t === 'dark' || t === 'light' || t === 'system') {
      setThemeState(t);
    }
  }, [profile]);

  const resolved: 'dark' | 'light' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  // Apply BOTH: data-theme attribute (for our CSS) AND .dark / .light classes (for Tailwind)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    // Our CSS system
    root.setAttribute('data-theme', resolved);

    // Tailwind's theme system
    root.classList.remove('dark', 'light');
    root.classList.add(resolved);
  }, [resolved]);

  return (
    <ThemeContext.Provider
      value={{ theme, resolved, setTheme: setThemeState }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: 'dark' as Theme,
      resolved: 'dark' as 'dark' | 'light',
      setTheme: () => {},
    };
  }
  return ctx;
}