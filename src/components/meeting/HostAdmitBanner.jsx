import React from 'react';
import { Check, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export function HostAdmitBanner({
  knockRequests = [],
  onAdmit,
  onDeny,
}) {
  const { isDark } = useTheme();

  if (!knockRequests || knockRequests.length === 0) return null;

  return (
    <div className="fixed top-20 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-auto animate-in slide-in-from-top duration-300">
      {knockRequests.map((req) => (
        <div
          key={req.applicantSocketId}
          className={`flex flex-col gap-3 rounded-2xl border p-4 text-sm shadow-2xl backdrop-blur-2xl transition-colors duration-200 ${isDark ? 'border-[#202533] bg-[#161a25]/95 text-white' : 'border-[#e8e9e2] bg-white/95 text-[#30322c]'}`}
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr text-sm font-bold shadow-md ${isDark ? 'from-indigo-600 to-cyan-500 text-white' : 'from-[#9bbc6d] to-[#d8edb5] text-[#262820]'}`}>
              {req.user?.name ? req.user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex-1 truncate">
              <div className="flex items-center gap-1.5">
                <span className={`truncate text-xs font-bold ${isDark ? 'text-white' : 'text-[#292b25]'}`}>{req.user?.name || 'Guest Participant'}</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${isDark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-[#f1f4e9] text-[#607745]'}`}>Knocking</span>
              </div>
              <p className={`truncate text-[11px] ${isDark ? 'text-gray-400' : 'text-[#777a72]'}`}>
                {req.user?.email || 'Wants to join this meeting'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={`flex items-center gap-2 border-t pt-1 ${isDark ? 'border-white/10' : 'border-[#ecece7]'}`}>
            <button
              type="button"
              onClick={() => onDeny(req.applicantSocketId, req.user)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${isDark ? 'border-white/5 bg-white/5 text-gray-400 hover:bg-red-500/20 hover:text-red-300' : 'border-[#e5e6df] bg-[#f4f5f1] text-[#777a72] hover:bg-red-50 hover:text-red-600'}`}
            >
              <X className="w-3.5 h-3.5" />
              <span>Deny</span>
            </button>
            <button
              type="button"
              onClick={() => onAdmit(req.applicantSocketId, req.user)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-md transition-all ${isDark ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400' : 'bg-[#9bbc6d] text-[#12151e] hover:bg-[#8ea862]'}`}
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
