import React from 'react';
import { Check, X } from 'lucide-react';

export function HostAdmitBanner({
  knockRequests = [],
  onAdmit,
  onDeny,
}) {
  if (!knockRequests || knockRequests.length === 0) return null;

  return (
    <div className="fixed top-20 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-auto animate-in slide-in-from-top duration-300">
      {knockRequests.map((req) => (
        <div
          key={req.applicantSocketId}
          className="rounded-2xl p-4 border border-[#e8e9e2] bg-white/95 text-[#30322c] backdrop-blur-2xl shadow-2xl flex flex-col gap-3 dark:border-[#202533] dark:bg-[#161a25]/95 dark:text-white"
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#9bbc6d] to-[#d8edb5] flex items-center justify-center text-[#262820] font-bold text-sm shadow-md dark:from-indigo-600 dark:to-cyan-500 dark:text-white">
              {req.user?.name ? req.user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex-1 truncate">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-[#292b25] truncate dark:text-white">{req.user?.name || 'Guest Participant'}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f1f4e9] text-[#607745] font-semibold dark:bg-indigo-500/20 dark:text-indigo-300">Knocking</span>
              </div>
              <p className="text-[11px] text-[#777a72] truncate dark:text-gray-400">
                {req.user?.email || 'Wants to join this meeting'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1 border-t border-[#ecece7] dark:border-white/10">
            <button
              type="button"
              onClick={() => onDeny(req.applicantSocketId, req.user)}
              className="flex-1 py-1.5 px-3 rounded-xl bg-[#f4f5f1] hover:bg-red-50 text-[#777a72] hover:text-red-600 border border-[#e5e6df] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors dark:bg-white/5 dark:hover:bg-red-500/20 dark:text-gray-400 dark:hover:text-red-300 dark:border-white/5"
            >
              <X className="w-3.5 h-3.5" />
              <span>Deny</span>
            </button>
            <button
              type="button"
              onClick={() => onAdmit(req.applicantSocketId, req.user)}
              className="flex-1 py-1.5 px-3 rounded-xl bg-[#9bbc6d] hover:bg-[#8ea862] text-[#12151e] shadow-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all dark:bg-gradient-to-r dark:from-emerald-600 dark:to-teal-500 dark:text-white"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Admit</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
