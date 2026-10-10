import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Mic, MicOff, Video, VideoOff, MonitorUp, 
  Sparkles, PhoneOff, MessageSquare, FileText,
  Smile, Hand, Subtitles, PenTool 
} from 'lucide-react';

export function ControlDock({
  mediaState,
  audioLevel,
  isSpeaking,
  sidebarOpen,
  activeSidebarTab,
  onToggleSidebar,
  onLeaveMeeting,
  isHandRaised = false,
  onToggleHandRaise,
  onSendReaction,
  captionsActive = true,
  onToggleCaptions,
  isTranscriptionEnabled = true,
  transcriptionError = '',
  isSpeechSupported = false,
  onToggleTranscription,
}) {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const reactionsRef = useRef(null);
  const reactionsMenuRef = useRef(null);
  const reactionButtonRef = useRef(null);
  const [reactionMenuPosition, setReactionMenuPosition] = useState(null);

  const emojiList = ['❤️', '👏', '👍', '🎉', '🔥', '💡', '😂', '😍'];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        reactionsRef.current && !reactionsRef.current.contains(e.target) &&
        reactionsMenuRef.current && !reactionsMenuRef.current.contains(e.target)
      ) {
        setShowReactionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showReactionsMenu) return undefined;

    const updatePosition = () => {
      const button = reactionButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const halfMenuWidth = Math.min(160, window.innerWidth / 2 - 8);
      const center = Math.max(halfMenuWidth, Math.min(window.innerWidth - halfMenuWidth, rect.left + rect.width / 2));
      setReactionMenuPosition({
        left: center,
        bottom: window.innerHeight - rect.top + 8,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showReactionsMenu]);

  return (
    <>
      {/* Floating Center Control Dock (Dribbble & Google Meet Modern Liquid Glass) */}
      <div className="fixed bottom-5 md:bottom-7 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-1.5rem)] select-none">
        <div className="liquid-dock px-3 md:px-5 py-2.5 rounded-full flex items-center gap-2 md:gap-3 overflow-x-auto max-w-full scrollbar-none [&>button]:shrink-0 [&>div]:shrink-0">
          
          {/* 1. Microphone Mute / Unmute */}
          <button
            type="button"
            onClick={mediaState.toggleAudio}
            className={`w-11 h-11 md:w-12 md:h-12 rounded-full transition-all duration-150 active:scale-95 flex items-center justify-center relative ${
              mediaState.isAudioMuted
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                : isSpeaking
                ? 'bg-[#B8F58A] text-[#08090B] border border-[#B8F58A] shadow-[0_0_15px_rgba(184,245,138,0.35)]'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/[0.06]'
            }`}
            title={mediaState.isAudioMuted ? 'Unmute microphone (Ctrl+D)' : 'Mute microphone (Ctrl+D)'}
          >
            {mediaState.isAudioMuted ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          {/* 2. Camera On / Off */}
          <button
            type="button"
            onClick={mediaState.toggleVideo}
            className={`w-11 h-11 md:w-12 md:h-12 rounded-full transition-all duration-150 active:scale-95 flex items-center justify-center ${
              mediaState.isVideoDisabled
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/[0.06]'
            }`}
            title={mediaState.isVideoDisabled ? 'Turn on camera (Ctrl+E)' : 'Turn off camera (Ctrl+E)'}
          >
            {mediaState.isVideoDisabled ? (
              <VideoOff className="w-5 h-5" />
            ) : (
              <Video className="w-5 h-5" />
            )}
          </button>

          {/* 3. Screen Share */}
          <button
            type="button"
            onClick={mediaState.toggleScreenShare}
            className={`w-11 h-11 md:w-12 md:h-12 rounded-full transition-all duration-150 active:scale-95 flex items-center justify-center ${
              mediaState.isScreenSharing
                ? 'bg-[#B8F58A] text-[#08090B] shadow-[0_0_15px_rgba(184,245,138,0.3)]'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-gray-300 border border-white/[0.06]'
            }`}
            title={mediaState.isScreenSharing ? 'Stop sharing screen' : 'Share your screen'}
          >
            <MonitorUp className="w-5 h-5" />
          </button>

          {/* 4. Raise Hand */}
          <button
            type="button"
            onClick={onToggleHandRaise}
            className={`w-11 h-11 md:w-12 md:h-12 rounded-full transition-all duration-150 active:scale-95 flex items-center justify-center ${
              isHandRaised
                ? 'bg-[#f0d38f] font-bold text-[#343324] shadow-lg shadow-[#f0d38f]/20'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-gray-300 border border-white/[0.06]'
            }`}
            title={isHandRaised ? 'Lower Hand' : 'Raise Hand'}
          >
            <Hand className="w-5 h-5" />
          </button>

          {/* 5. Reactions Menu */}
          <div className="relative" ref={reactionsRef}>
            <button
              type="button"
              ref={reactionButtonRef}
              onClick={() => setShowReactionsMenu((visible) => !visible)}
              className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-gray-300 border border-white/[0.06] transition-all active:scale-95 flex items-center justify-center"
              title="Send emoji reaction"
            >
              <Smile className="w-5 h-5 text-amber-400" />
            </button>

          </div>

          {/* 6. Closed Captions (CC) Overlay Toggle */}
          <button
            type="button"
            onClick={onToggleCaptions}
            className={`w-11 h-11 md:w-12 md:h-12 rounded-full transition-all duration-150 active:scale-95 flex items-center justify-center ${
              captionsActive
                ? 'bg-white/20 text-white border border-white/30'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-gray-400 border border-white/[0.06]'
            }`}
            title={captionsActive ? 'Hide live captions' : 'Show live captions'}
          >
            <Subtitles className="w-5 h-5" />
          </button>

          {/* Speech recognition is independent of whether captions are visible. */}
          <button
            type="button"
            onClick={onToggleTranscription}
            disabled={!isSpeechSupported}
            aria-label={`${isTranscriptionEnabled ? 'Pause' : 'Start'} transcription${transcriptionError ? `. ${transcriptionError}` : ''}`}
            aria-pressed={isSpeechSupported && isTranscriptionEnabled}
            className={`w-11 h-11 md:w-12 md:h-12 rounded-full transition-all duration-150 active:scale-95 flex items-center justify-center ${
              !isSpeechSupported
                ? 'cursor-not-allowed bg-white/[0.04] text-gray-500 opacity-60'
                : transcriptionError
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                : isTranscriptionEnabled
                  ? 'bg-[#B8F58A] text-[#08090B] shadow-[0_0_15px_rgba(184,245,138,0.3)]'
                  : 'bg-white/[0.08] hover:bg-white/[0.15] text-gray-300 border border-white/[0.06]'
            }`}
            title={transcriptionError || (!isSpeechSupported
              ? 'Live transcription is not supported by this browser'
              : isTranscriptionEnabled ? 'Pause live transcription' : 'Start live transcription')}
          >
            <FileText className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-white/10 mx-0.5" />

          {/* 7. Collaborative Whiteboard Toggle */}
          <button
            type="button"
            onClick={() => onToggleSidebar('whiteboard')}
            className={`w-11 h-11 md:w-12 md:h-12 rounded-full transition-all duration-150 active:scale-95 flex items-center justify-center ${
              sidebarOpen && activeSidebarTab === 'whiteboard'
                ? 'bg-[#B8F58A] text-[#08090B] shadow-[0_0_15px_rgba(184,245,138,0.3)]'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-gray-300 border border-white/[0.06]'
            }`}
            title="Collaborative Whiteboard Canvas"
          >
            <PenTool className="w-5 h-5" />
          </button>

          {/* 8. AI Notes & Intelligence Sidebar Toggle (Hero Button) */}
          <button
            type="button"
            onClick={() => onToggleSidebar('notes')}
            className={`h-11 md:h-12 px-4 md:px-5 rounded-full transition-all duration-150 active:scale-95 flex items-center gap-2 font-medium text-xs md:text-sm ${
              sidebarOpen && activeSidebarTab === 'notes'
                ? 'bg-[#B8F58A] text-[#08090B] shadow-[0_0_20px_rgba(184,245,138,0.35)]'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-gray-300 border border-white/[0.06]'
            }`}
            title="Toggle Gemini AI Meeting Notes & Action Items"
          >
            <Sparkles className="w-4 h-4 text-[#08090B] dark:text-[#08090B]" />
            <span className="hidden sm:inline-block font-semibold">AI Notes</span>
          </button>

          {/* 9. Room Chat Toggle */}
          <button
            type="button"
            onClick={() => onToggleSidebar('chat')}
            className={`w-11 h-11 md:w-12 md:h-12 rounded-full transition-all duration-150 active:scale-95 flex items-center justify-center ${
              sidebarOpen && activeSidebarTab === 'chat'
                ? 'bg-[#B8F58A] text-[#08090B] border border-[#B8F58A] shadow-[0_0_15px_rgba(184,245,138,0.3)]'
                : 'bg-white/[0.08] hover:bg-white/[0.15] text-gray-300 border border-white/[0.06]'
            }`}
            title="Room Chat"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-white/10 mx-0.5" />

          {/* 10. Leave / End Call Pill Button */}
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            className="flex items-center justify-center gap-2 px-5 md:px-6 h-11 md:h-12 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 text-white font-medium text-xs md:text-sm transition-all shadow-lg shadow-red-600/30"
            title="Leave Meeting"
          >
            <PhoneOff className="w-4 h-4" />
            <span className="hidden md:inline-block font-semibold">Leave</span>
          </button>
        </div>
      </div>

      {showReactionsMenu && reactionMenuPosition && createPortal(
        <div
          ref={reactionsMenuRef}
          className="liquid-glass fixed z-[100] flex -translate-x-1/2 items-center gap-1 rounded-2xl p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
          style={{ left: reactionMenuPosition.left, bottom: reactionMenuPosition.bottom }}
        >
          {emojiList.map((em) => (
            <button
              key={em}
              type="button"
              aria-label={`Send ${em} reaction`}
              onClick={() => {
                onSendReaction(em);
                setShowReactionsMenu(false);
              }}
              className="rounded-xl p-1.5 text-xl transition-transform hover:scale-130 hover:bg-white/10 active:scale-95"
            >
              {em}
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* Modern Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#20211e]/35 p-4 backdrop-blur-sm animate-in fade-in duration-150 dark:bg-black/75">
          <div className="w-full max-w-sm rounded-3xl border border-white bg-[#fffefa] p-6 text-center text-[#34362f] shadow-[0_24px_70px_rgba(37,43,34,0.22)] md:p-8 dark:border-[#222736] dark:bg-[#12151e] dark:text-[#f3f4f6] dark:shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#f2d5ca] bg-[#fff0e8] text-[#c75f51] dark:border-[#4d2320] dark:bg-[#2a1413] dark:text-[#f87171]">
              <PhoneOff className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-[#292b25] dark:text-[#f3f4f6]">Leave meeting?</h3>
            <p className="mb-6 text-xs leading-relaxed text-[#777a72] dark:text-[#9ca3af]">
              Your transcript and generated AI notes are automatically synced to your persistent database records.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 rounded-2xl border border-[#e5e6df] bg-white py-3 text-xs font-semibold text-[#5e6058] transition-colors hover:bg-[#f4f5f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 dark:border-[#262c3c] dark:bg-[#181d28] dark:text-[#d1d5db] dark:hover:bg-[#202737]"
              >
                Stay in Call
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLeaveConfirm(false);
                  onLeaveMeeting();
                }}
                className="flex-1 rounded-2xl bg-[#d94d49] py-3 text-xs font-semibold text-white shadow-md shadow-[#d94d49]/20 transition-colors hover:bg-[#c9413e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d94d49]/50 focus-visible:ring-offset-2"
              >
                Yes, Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
