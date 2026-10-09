import React from 'react';
import { Loader2, ArrowLeft, Lock } from 'lucide-react';
import { ThemeToggle } from '../common/ThemeToggle';

export function WaitingRoomScreen({
  roomId,
  userName,
  onCancelKnock,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#eef0ed] text-[#30322c] select-none dark:bg-[#0c0e14] dark:text-[#f3f4f6]">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle variant="header" />
      </div>

      {/* Background Gradient Orbs */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-[#9bbc6d]/10 rounded-full blur-3xl pointer-events-none animate-pulse dark:bg-[#ff777b]/10" />
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-[#8aa767]/[0.08] rounded-full blur-3xl pointer-events-none animate-pulse dark:bg-[#b7f879]/[0.06]" />

      <div className="w-full max-w-lg rounded-3xl border border-[#e7e8e2] bg-white p-8 md:p-10 text-center shadow-2xl relative flex flex-col items-center dark:border-[#202533] dark:bg-[#161a25]">
        {/* Animated Radar Pulse */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#9bbc6d] to-[#d8edb5] flex items-center justify-center shadow-xl shadow-[#9bbc6d]/20 relative z-10 dark:from-[#ff8586] dark:to-[#d85e77] dark:shadow-[#ff777b]/20">
            <Lock className="w-8 h-8 text-[#262820] animate-bounce dark:text-white" />
          </div>
          <div className="absolute inset-0 rounded-full bg-[#9bbc6d]/30 animate-ping dark:bg-[#ff777b]/30" />
          <div className="absolute -inset-3 rounded-full bg-[#9bbc6d]/15 animate-pulse dark:bg-[#ff777b]/15" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-extrabold text-[#292b25] tracking-tight mb-2 dark:text-white">
          Asking to be let in...
        </h2>
        <p className="text-sm text-[#777a72] max-w-sm mb-6 leading-relaxed dark:text-gray-300">
          You'll join the meeting <span className="font-semibold text-[#805437] font-mono dark:text-[#ffaaa9]">"{roomId}"</span> as soon as the host admits you.
        </p>

        {/* Status Badge */}
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#f5f7ef] border border-[#e6eadc] text-xs text-[#748b52] mb-8 dark:bg-[#ff777b]/10 dark:border-[#ff777b]/25 dark:text-[#ffc0c0]">
          <Loader2 className="w-4 h-4 animate-spin text-[#8aa767] dark:text-[#ff8586]" />
          <span>Waiting for host approval for <strong>{userName}</strong></span>
        </div>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={onCancelKnock}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-[#e5e7df] bg-white text-xs font-semibold text-[#555850] shadow-sm transition-all hover:bg-[#f1f4e9] hover:text-[#536a37] active:scale-95 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Lobby</span>
        </button>
      </div>
    </div>
  );
}
