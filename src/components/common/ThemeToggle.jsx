import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export function ThemeToggle({ variant = 'header', className = '' }) {
  const { isDark, toggleTheme } = useTheme();

  if (variant === 'menu') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium text-[#34362f] transition-colors hover:bg-[#f4f5f1] dark:text-[#e2e5eb] dark:hover:bg-[#202636] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 ${className}`}
        role="switch"
        aria-checked={isDark}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <span className="flex items-center gap-2">
          {isDark ? (
            <Sun className="h-4 w-4 text-amber-400 transition-transform duration-200 rotate-0" />
          ) : (
            <Moon className="h-4 w-4 text-[#777a72] transition-transform duration-200" />
          )}
          <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
        </span>
        <span
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
            isDark ? 'bg-[#9bbc6d]' : 'bg-[#e2e4dc]'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
              isDark ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </span>
      </button>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`flex h-9 w-9 items-center justify-center rounded-full border border-[#e7e8e3] bg-white text-[#60635b] transition-all hover:bg-[#f4f5f1] active:scale-95 dark:border-[#242b3b] dark:bg-[#181d28] dark:text-[#a0a6b5] dark:hover:bg-[#202737] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 ${className}`}
      >
        {isDark ? (
          <Sun className="h-4 w-4 text-amber-400 animate-in spin-in-90 duration-300" />
        ) : (
          <Moon className="h-4 w-4 text-[#60635b] transition-transform duration-200 hover:-rotate-12" />
        )}
      </button>
    );
  }

  // Default: 'header' pill variant
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`group flex h-9 items-center gap-1.5 rounded-full border border-[#e7e8e3] bg-white px-2.5 text-[10px] font-semibold text-[#60635b] transition-all hover:bg-[#f4f5f1] active:scale-95 dark:border-[#242b3b] dark:bg-[#181d28] dark:text-[#a0a6b5] dark:hover:bg-[#202737] sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 ${className}`}
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5 text-amber-400 transition-transform duration-300 group-hover:rotate-45" />
      ) : (
        <Moon className="h-3.5 w-3.5 text-[#73766e] transition-transform duration-300 group-hover:-rotate-12" />
      )}
      <span className="hidden sm:inline font-medium">
        {isDark ? 'Light' : 'Dark'}
      </span>
    </button>
  );
}
