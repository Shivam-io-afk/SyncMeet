import React from 'react';
import { Home, RefreshCw, Video, WifiOff } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export function StatusPage({ type, onRetry }) {
  const isOffline = type === 'offline';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef0ed] px-5 py-10 text-[#30322c] dark:bg-[#0c0e14] dark:text-[#f3f4f6]">
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle variant="header" />
      </div>

      <section className="relative w-full max-w-lg text-center">
        <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-[19px] bg-gradient-to-br from-[#d8edb5] to-[#f2b59c] text-[#30332a] shadow-lg shadow-[#7d9560]/10">
          {isOffline ? <WifiOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
        </div>

        <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[#718b4f] dark:text-[#b4d688]">
          SyncMeet AI
        </p>
        <p className="mb-2 text-6xl font-bold tracking-tight text-[#d4dbc9] dark:text-[#293142]" aria-hidden="true">
          {isOffline ? 'OFFLINE' : '404'}
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {isOffline ? 'You’re offline' : 'We can’t find that page'}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#777a72] dark:text-[#a0a6b5]">
          {isOffline
            ? 'Your connection was interrupted. Reconnect to the internet and try again; some meeting features need a connection.'
            : 'The link may be outdated, or the page may have moved. Head back to SyncMeet to continue.'}
        </p>

        {isOffline ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#171815] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#30322c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/60 focus-visible:ring-offset-2 dark:bg-[#222838] dark:hover:bg-[#2c344a]"
          >
            <RefreshCw className="h-4 w-4" />
            Check connection
          </button>
        ) : (
          <a
            href="/"
            className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#171815] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#30322c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/60 focus-visible:ring-offset-2 dark:bg-[#222838] dark:hover:bg-[#2c344a]"
          >
            <Home className="h-4 w-4" />
            Back to SyncMeet
          </a>
        )}
      </section>
    </main>
  );
}
