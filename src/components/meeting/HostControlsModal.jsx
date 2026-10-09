import React, { useState } from 'react';
import { 
  ShieldCheck, Lock, Unlock, MicOff, PhoneOff, X
} from 'lucide-react';

export function HostControlsModal({
  isOpen,
  onClose,
  isRoomLocked = false,
  onToggleLockRoom,
  onMuteAll,
  onEndMeetingForAll,
}) {
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [mutedFeedback, setMutedFeedback] = useState(false);

  if (!isOpen) return null;

  const handleMuteAllClick = () => {
    onMuteAll();
    setMutedFeedback(true);
    setTimeout(() => setMutedFeedback(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#20231d]/35 p-3 backdrop-blur-sm animate-in fade-in duration-150 sm:p-4 dark:bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="host-controls-title"
        className="relative w-full max-w-lg rounded-[24px] border border-white/80 bg-[#f8f8f5] p-4 text-[#30322c] shadow-[0_24px_80px_rgba(37,43,34,0.22)] sm:rounded-[28px] sm:p-6 dark:border-[#222736] dark:bg-[#12151e] dark:text-[#f3f4f6]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close host controls"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-[#85877f] transition-colors hover:bg-[#eff0eb] hover:text-[#30322c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 sm:right-4 sm:top-4 dark:text-[#8d93a3] dark:hover:bg-[#1e2434] dark:hover:text-[#f3f4f6]"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center gap-3 pr-9 sm:mb-6 sm:pr-10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] border border-[#e4ead8] bg-[#f1f4e9] text-[#718b4f] sm:h-12 sm:w-12 dark:border-[#203022] dark:bg-[#172318] dark:text-[#9bbc6d]">
            <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h2 id="host-controls-title" className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#30322c] sm:text-base dark:text-[#f3f4f6]">
              <span>Host controls</span>
              <span className="rounded-full border border-[#eadfcf] bg-[#f8f1e8] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#98734f] dark:border-[#423321] dark:bg-[#251d14] dark:text-[#f4a261]">
                Host
              </span>
            </h2>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[#85877f] sm:text-xs dark:text-[#8d93a3]">
              Manage participant permissions and room access.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <section className="flex flex-col gap-3 rounded-2xl border border-[#e8e9e3] bg-white p-3.5 shadow-[0_6px_20px_rgba(37,43,34,0.035)] sm:flex-row sm:items-center sm:justify-between sm:p-4 dark:border-[#202636] dark:bg-[#161a25]">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff2ee] text-[#b94f43] dark:bg-[#341d1a] dark:text-[#f87171]">
                <MicOff className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-bold text-[#34362f] dark:text-[#f3f4f6]">Mute all participants</span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-[#85877f] sm:text-[11px] dark:text-[#8d93a3]">
                  Mutes every participant’s microphone.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleMuteAllClick}
              className="w-full rounded-xl border border-[#f0d3ca] bg-[#fff2ee] px-3.5 py-2 text-[11px] font-semibold text-[#a8453c] transition-colors hover:bg-[#ffe8e1] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d97868]/40 sm:w-auto dark:border-[#522521] dark:bg-[#361c1a] dark:text-[#f87171] dark:hover:bg-[#45211e]"
            >
              {mutedFeedback ? 'All Muted!' : 'Mute All'}
            </button>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-[#e8e9e3] bg-white p-3.5 shadow-[0_6px_20px_rgba(37,43,34,0.035)] sm:flex-row sm:items-center sm:justify-between sm:p-4 dark:border-[#202636] dark:bg-[#161a25]">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                isRoomLocked ? 'bg-[#f8f1e8] text-[#98734f] dark:bg-[#251d14] dark:text-[#f4a261]' : 'bg-[#f1f6e8] text-[#718b4f] dark:bg-[#1a2919] dark:text-[#9bbc6d]'
              }`}>
                {isRoomLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-bold text-[#34362f] dark:text-[#f3f4f6]">
                  {isRoomLocked ? 'Meeting is locked' : 'Meeting is open'}
                </span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-[#85877f] sm:text-[11px] dark:text-[#8d93a3]">
                  {isRoomLocked ? 'No new participants can join.' : 'Anyone with the room link can join.'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleLockRoom}
              className={`w-full rounded-xl border px-3.5 py-2 text-[11px] font-semibold transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 sm:w-auto ${
                isRoomLocked
                  ? 'border-[#dce7cb] bg-[#f1f6e8] text-[#536a37] hover:bg-[#e8f0dc] dark:border-[#384e2a] dark:bg-[#1f2e1a] dark:text-[#9bbc6d]'
                  : 'border-[#e1e3dc] bg-[#f8f9f5] text-[#555850] hover:bg-[#eff0eb] dark:border-[#242b3b] dark:bg-[#1d2331] dark:text-[#d1d5db] dark:hover:bg-[#252d3f]'
              }`}
            >
              {isRoomLocked ? 'Unlock Room' : 'Lock Room'}
            </button>
          </section>

          <div className="pt-1">
            {!showEndConfirm ? (
              <button
                type="button"
                onClick={() => setShowEndConfirm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#f0d3ca] bg-[#fff2ee] px-4 py-2.5 text-[11px] font-semibold text-[#a8453c] transition-colors hover:bg-[#ffe8e1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d97868]/40 dark:border-[#522521] dark:bg-[#361c1a] dark:text-[#f87171] dark:hover:bg-[#45211e]"
              >
                <PhoneOff className="h-4 w-4" />
                <span>End Meeting for Everyone</span>
              </button>
            ) : (
              <div className="space-y-3 rounded-2xl border border-[#f0d3ca] bg-[#fff7f4] p-3.5 text-center animate-in fade-in sm:p-4 dark:border-[#522521] dark:bg-[#281615]">
                <p className="text-xs font-semibold leading-relaxed text-[#8e443c] dark:text-[#fca5a5]">
                  End the meeting for everyone? All participants will be disconnected.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEndConfirm(false)}
                    className="flex-1 rounded-xl border border-[#e1e3dc] bg-white py-2 text-xs font-semibold text-[#555850] transition-colors hover:bg-[#f8f9f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 dark:border-[#242b3b] dark:bg-[#1a1f2c] dark:text-[#d1d5db] dark:hover:bg-[#202737]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onEndMeetingForAll}
                    className="flex-1 rounded-xl bg-[#b94f43] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#a8453c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b94f43]/40 focus-visible:ring-offset-2"
                  >
                    Yes, End for All
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
