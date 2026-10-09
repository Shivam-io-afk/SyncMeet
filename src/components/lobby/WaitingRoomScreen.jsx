import React from 'react';
import { Loader2, ArrowLeft, Lock } from 'lucide-react';

export function WaitingRoomScreen({
  roomId,
  userName,
  onCancelKnock,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-canvas text-white select-none">
      {/* Background Gradient Orbs */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-[#ff777b]/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-[#b7f879]/[0.06] rounded-full blur-3xl pointer-events-none animate-pulse" />

      <div className="glass-panel w-full max-w-lg rounded-3xl border border-[#ff777b]/20 p-8 md:p-10 text-center shadow-2xl relative flex flex-col items-center">
        {/* Animated Radar Pulse */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#ff8586] to-[#d85e77] flex items-center justify-center shadow-xl shadow-[#ff777b]/20 relative z-10">
            <Lock className="w-8 h-8 text-white animate-bounce" />
          </div>
          <div className="absolute inset-0 rounded-full bg-[#ff777b]/30 animate-ping" />
          <div className="absolute -inset-3 rounded-full bg-[#ff777b]/15 animate-pulse" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-extrabold text-white tracking-tight mb-2">
          Asking to be let in...
        </h2>
        <p className="text-sm text-gray-300 max-w-sm mb-6 leading-relaxed">
          You'll join the meeting <span className="font-semibold text-[#ffaaa9] font-mono">"{roomId}"</span> as soon as the host admits you.
        </p>

        {/* Status Badge */}
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#ff777b]/10 border border-[#ff777b]/25 text-xs text-[#ffc0c0] mb-8">
          <Loader2 className="w-4 h-4 animate-spin text-[#ff8586]" />
          <span>Waiting for host approval for <strong>{userName}</strong></span>
        </div>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={onCancelKnock}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white transition-all text-xs font-semibold active:scale-95 border border-white/5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Lobby</span>
        </button>
      </div>
    </div>
  );
}
