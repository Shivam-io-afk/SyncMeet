import React from 'react';
import { Loader2, ArrowLeft, Lock } from 'lucide-react';
import { ThemeToggle } from '../common/ThemeToggle';
import { useTheme } from '../../context/ThemeContext';

export function WaitingRoomScreen({
  roomId,
  userName,
  onCancelKnock,
}) {
  const { isDark } = useTheme();

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 select-none transition-colors duration-200 ${isDark ? 'bg-[#0c0e14] text-[#f3f4f6]' : 'bg-[#eef0ed] text-[#30322c]'}`}>
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle variant="header" />
      </div>

      {/* Background Gradient Orbs */}
      <div className={`absolute top-1/4 left-1/3 w-96 h-96 rounded-full blur-3xl pointer-events-none animate-pulse ${isDark ? 'bg-[#ff777b]/10' : 'bg-[#9bbc6d]/10'}`} />
      <div className={`absolute bottom-1/4 right-1/3 w-96 h-96 rounded-full blur-3xl pointer-events-none animate-pulse ${isDark ? 'bg-[#b7f879]/[0.06]' : 'bg-[#8aa767]/[0.08]'}`} />

      <div className={`relative flex w-full max-w-lg flex-col items-center rounded-3xl border p-8 text-center shadow-2xl transition-colors duration-200 md:p-10 ${isDark ? 'border-[#202533] bg-[#161a25]' : 'border-[#e7e8e2] bg-white'}`}>
        {/* Animated Radar Pulse */}
        <div className="relative mb-6">
          <div className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr shadow-xl ${isDark ? 'from-[#ff8586] to-[#d85e77] shadow-[#ff777b]/20' : 'from-[#9bbc6d] to-[#d8edb5] shadow-[#9bbc6d]/20'}`}>
            <Lock className={`h-8 w-8 animate-bounce ${isDark ? 'text-white' : 'text-[#262820]'}`} />
          </div>
          <div className={`absolute inset-0 animate-ping rounded-full ${isDark ? 'bg-[#ff777b]/30' : 'bg-[#9bbc6d]/30'}`} />
          <div className={`absolute -inset-3 animate-pulse rounded-full ${isDark ? 'bg-[#ff777b]/15' : 'bg-[#9bbc6d]/15'}`} />
        </div>

        {/* Title */}
        <h2 className={`mb-2 text-2xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-[#292b25]'}`}>
          Asking to be let in...
        </h2>
        <p className={`mb-6 max-w-sm text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-[#777a72]'}`}>
          You'll join the meeting <span className={`font-mono font-semibold ${isDark ? 'text-[#ffaaa9]' : 'text-[#805437]'}`}>"{roomId}"</span> as soon as the host admits you.
        </p>

        {/* Status Badge */}
        <div className={`mb-8 flex items-center gap-2.5 rounded-full border px-4 py-2 text-xs ${isDark ? 'border-[#ff777b]/25 bg-[#ff777b]/10 text-[#ffc0c0]' : 'border-[#e6eadc] bg-[#f5f7ef] text-[#748b52]'}`}>
          <Loader2 className={`h-4 w-4 animate-spin ${isDark ? 'text-[#ff8586]' : 'text-[#8aa767]'}`} />
          <span>Waiting for host approval for <strong>{userName}</strong></span>
        </div>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={onCancelKnock}
          className={`flex items-center gap-2 rounded-xl border px-6 py-2.5 text-xs font-semibold shadow-sm transition-all active:scale-95 ${isDark ? 'border-white/5 bg-white/10 text-gray-300 hover:bg-white/15 hover:text-white' : 'border-[#e5e7df] bg-white text-[#555850] hover:bg-[#f1f4e9] hover:text-[#536a37]'}`}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Lobby</span>
        </button>
      </div>
    </div>
  );
}
