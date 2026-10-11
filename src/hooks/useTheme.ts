import { useCallback, useEffect, useState } from 'react';
import { loadPrefs, savePref } from '@/lib/storage';

export type Theme = 'system' | 'light' | 'dark';

const isTheme = (v: unknown): v is Theme => v === 'system' || v === 'light' || v === 'dark';

/** Persists only the theme preference; applies the `dark` class on <html>. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>('system');

  useEffect(() => {
    void loadPrefs().then((p) => {
      if (isTheme(p.theme)) setThemeState(p.theme);
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    void savePref('theme', t);
  }, []);

  return [theme, setTheme];
}
