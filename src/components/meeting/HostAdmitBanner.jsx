import React from 'react';
import { UserPlus, Check, X, Shield, Clock } from 'lucide-react';

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
          className="glass-panel rounded-2xl p-4 border border-indigo-500/40 bg-surface-elevated/95 backdrop-blur-2xl shadow-2xl flex flex-col gap-3"
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
              {req.user?.name ? req.user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex-1 truncate">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">{req.user?.name || 'Guest Participant'}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">Knocking</span>
              </div>
              <p className="text-[11px] text-gray-400 truncate">
                {req.user?.email || 'Wants to join this meeting'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1 border-t border-white/10">
            <button
              type="button"
              onClick={() => onDeny(req.applicantSocketId, req.user)}
              className="flex-1 py-1.5 px-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Deny</span>
            </button>
            <button
              type="button"
              onClick={() => onAdmit(req.applicantSocketId, req.user)}
              className="flex-1 py-1.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:opacity-90 text-white shadow-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
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
