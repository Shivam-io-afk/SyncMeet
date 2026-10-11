import React, { useEffect } from 'react';
import { CircleAlert, X } from 'lucide-react';

export function NotificationToast({ notification, onDismiss }) {
  useEffect(() => {
    if (!notification) return undefined;

    const timeoutId = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timeoutId);
  }, [notification, onDismiss]);

  if (!notification) return null;

  return (
    <div
      role="alert"
      className="fixed right-4 top-4 z-[100] flex w-80 max-w-[calc(100vw_-_2rem)] items-start gap-3 rounded-2xl border border-[#f0d5ce] bg-white p-4 text-[#4b302c] shadow-[0_16px_48px_rgba(37,43,34,0.18)] dark:border-[#522922] dark:bg-[#211715] dark:text-[#f3f4f6]"
    >
      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#bd5b4f] dark:text-[#f87171]" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm leading-relaxed">{notification.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#85877f] transition-colors hover:bg-[#f6ece9] hover:text-[#4b302c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d97868]/50 dark:text-[#a0a6b5] dark:hover:bg-[#341d1a] dark:hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
