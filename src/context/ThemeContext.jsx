import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

const ThemeContext = createContext(null);

const THEME_STORAGE_KEY = 'syncmeet_theme';

function getSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;

    const legacyStored = sessionStorage.getItem(THEME_STORAGE_KEY);
    if (legacyStored === 'dark' || legacyStored === 'light') {
      localStorage.setItem(THEME_STORAGE_KEY, legacyStored);
      return legacyStored;
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage access errors
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStoredTheme() || getSystemTheme());

  const isDark = theme === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  }, [theme, isDark]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;

    const handleSystemThemeChange = (event) => {
      if (!readStoredTheme()) setThemeState(event.matches ? 'dark' : 'light');
    };
    media.addEventListener?.('change', handleSystemThemeChange);
    return () => media.removeEventListener?.('change', handleSystemThemeChange);
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) return;
      } catch {
        return;
      }
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      if (event.newValue === 'dark' || event.newValue === 'light') {
        setThemeState(event.newValue);
      } else {
        setThemeState(getSystemTheme());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme = isDark ? 'light' : 'dark';
    storeTheme(nextTheme);
    setThemeState(nextTheme);
  }, [isDark]);

  const setTheme = useCallback((newTheme) => {
    if (newTheme === 'dark' || newTheme === 'light') {
      storeTheme(newTheme);
      setThemeState(newTheme);
    }
  }, []);

  const value = useMemo(() => ({
    theme,
    isDark,
    toggleTheme,
    setTheme,
  }), [theme, isDark, toggleTheme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
