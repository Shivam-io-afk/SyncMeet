import React, { useRef, useEffect, useState } from 'react';
import { 
  MicOff, Pin, Sparkle, Maximize2, Volume2, Monitor, Hand 
} from 'lucide-react';
import { AudioVisualizer } from '../ui/AudioVisualizer';

export function VideoTile({
  participant,
  isLocal = false,
  isScreenShare = false,
  stream = null,
  audioLevel = 0,
  isSpeaking = false,
  isPinned = false,
  isSpotlight = false,
  onTogglePin,
  className = "",
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [studioEffectEnabled, setStudioEffectEnabled] = useState(false);
  const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);
  const hasVideoTrack = stream?.getVideoTracks().some((track) => track.readyState === 'live');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasVideoTrack || participant.isVideoDisabled) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.play().catch((err) => {
      if (err.name !== 'AbortError') {
        console.warn('Could not play participant video:', err);
      }
    });
  }, [stream, hasVideoTrack, participant.isVideoDisabled]);

  useEffect(() => {
    const audio = audioRef.current;
    const hasLiveAudio = stream?.getAudioTracks().some((track) => track.readyState === 'live');
    if (!audio || isLocal || !hasLiveAudio) return;

    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }
    audio.play().then(() => {
      setAudioNeedsGesture(false);
    }).catch((err) => {
      if (err.name === 'NotAllowedError') {
        setAudioNeedsGesture(true);
      } else if (err.name !== 'AbortError') {
        console.warn('Could not play participant audio:', err);
      }
    });
  }, [stream, isLocal]);

  const handlePiP = async () => {
    if (videoRef.current && document.pictureInPictureEnabled) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await videoRef.current.requestPictureInPicture();
        }
      } catch (err) {
        console.warn('PiP error:', err);
      }
    }
  };

  const getFilterClass = () => (
    studioEffectEnabled ? 'contrast-125 saturate-110 brightness-105' : ''
  );

  return (
    <div
      className={`group relative flex h-full w-full select-none items-center justify-center overflow-hidden transition-all duration-300 ${
        isSpotlight
          ? 'rounded-[26px] md:rounded-[30px] border border-[#B8F58A]/85 hover:border-[#B8F58A] bg-[#08090B] dark:bg-[#121319] shadow-[0_0_24px_rgba(184,245,138,0.12)] hover:shadow-[0_0_32px_rgba(184,245,138,0.22)]'
          : `rounded-[16px] md:rounded-[18px] bg-[#202023] dark:bg-[#202023] ${
              isSpeaking
                ? 'border border-[#B8F58A] ring-1 ring-[#B8F58A] shadow-[0_0_14px_rgba(184,245,138,0.2)]'
                : 'border border-white/[0.08] hover:border-white/20'
            }`
      } ${className}`}
    >
      {/* Video Stream Element */}
      {hasVideoTrack && !participant.isVideoDisabled ? (
        <div className="w-full h-full relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className={`w-full h-full ${isScreenShare ? 'object-contain bg-black' : 'object-cover'} ${
              isLocal && !isScreenShare ? 'scale-x-[-1]' : ''
            } ${getFilterClass()}`}
          />
          {/* Subtle bottom vignette gradient for optimal text contrast */}
          <div className={`pointer-events-none absolute inset-0 ${
            isSpotlight
              ? 'bg-gradient-to-t from-black/85 via-black/30 to-transparent'
              : 'bg-gradient-to-t from-black/80 via-transparent to-transparent'
          }`} />
        </div>
      ) : (
        /* Video Off Avatar State */
        <div className={`flex h-full w-full select-none flex-col items-center justify-center ${
          isSpotlight
            ? 'bg-gradient-to-br from-[#1A1D26] to-[#0E1015] text-[#A7AFBD]'
            : 'bg-[#202023] text-[#A7AFBD]'
        }`}>
          <div className="relative">
            {participant.avatar ? (
              <img
                src={participant.avatar}
                alt={participant.name}
                className={`${
                  isSpotlight
                    ? 'h-24 w-24 md:h-28 md:w-28 rounded-full object-cover shadow-2xl ring-4 ring-white/10'
                    : 'h-14 w-14 md:h-16 md:w-16 rounded-full object-cover shadow-lg ring-2 ring-white/10'
                } transition-all group-hover:ring-white/25`}
              />
            ) : (
              <div className={`flex items-center justify-center rounded-full bg-gradient-to-tr from-[#B8F58A] to-[#f2b59c] p-0.5 shadow-xl ${
                isSpotlight ? 'h-24 w-24 md:h-28 md:w-28' : 'h-14 w-14 md:h-16 md:w-16'
              }`}>
                <div className={`flex h-full w-full items-center justify-center rounded-full bg-[#181D28] font-bold text-[#F5F5F5] ${
                  isSpotlight ? 'text-2xl md:text-3xl' : 'text-base md:text-lg'
                }`}>
                  {participant.name ? participant.name.charAt(0).toUpperCase() : 'U'}
                </div>
              </div>
            )}

            {/* Speaking Pulse Ring */}
            {isSpeaking && (
              <span className="absolute -inset-1.5 animate-ping rounded-full border-2 border-[#B8F58A] opacity-75" />
            )}

            {!isLocal && stream?.getAudioTracks().some((track) => track.readyState === 'live') && (
              <>
                <audio ref={audioRef} autoPlay />
                {audioNeedsGesture && (
                  <button
                    type="button"
                    onClick={() => {
                      audioRef.current?.play().then(() => setAudioNeedsGesture(false)).catch((err) => {
                        console.warn('Could not enable participant audio:', err);
                      });
                    }}
                    className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-xs text-white backdrop-blur hover:bg-black shadow-lg border border-white/10"
                    title={`Enable audio from ${participant.name || 'participant'}`}
                  >
                    <Volume2 className="h-3.5 w-3.5 text-[#B8F58A]" />
                    <span>Unmute Audio</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Screen Share Tag Banner */}
      {isScreenShare && (
        <div className="absolute left-3.5 top-3.5 z-20 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/65 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
          <Monitor className="h-3.5 w-3.5 text-[#B8F58A]" />
          <span>Screen Presentation</span>
        </div>
      )}

      {/* Muted Microphone Indicator in Top-Left for secondary participant cards */}
      {!isSpotlight && participant.isMuted && (
        <div className="pointer-events-none absolute top-3 left-3 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/70 backdrop-blur-sm">
          <MicOff className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Raised Hand Badge Indicator */}
      {participant.isHandRaised && (
        <div className="absolute left-3.5 top-3.5 z-20 flex animate-bounce items-center gap-1.5 rounded-full bg-[#f1d58e] px-3 py-1 text-xs font-bold text-[#363324] shadow-lg">
          <Hand className="w-3.5 h-3.5 fill-black" />
          <span>Hand Raised</span>
        </div>
      )}

      {/* Top Right Quick Action Tools (Hover) */}
      <div className="absolute right-3.5 top-3.5 z-30 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/65 p-1 opacity-0 shadow-xl backdrop-blur-md transition-opacity group-hover:opacity-100">
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            className={`p-1.5 md:p-2 rounded-full transition-colors ${
              isPinned ? 'bg-[#B8F58A] text-[#12151E]' : 'text-gray-200 hover:bg-white/15 hover:text-white'
            }`}
            title={isPinned ? 'Unpin tile' : 'Pin to spotlight'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        )}

        {isLocal && (
          <button
            type="button"
            onClick={() => setStudioEffectEnabled((enabled) => !enabled)}
            aria-pressed={studioEffectEnabled}
            className={`p-1.5 md:p-2 rounded-full transition-colors ${
              studioEffectEnabled ? 'bg-[#B8F58A] font-bold text-[#12151E]' : 'text-gray-200 hover:bg-white/15 hover:text-white'
            }`}
            title={studioEffectEnabled ? 'Turn off studio visual effect' : 'Turn on studio visual effect'}
          >
            <Sparkle className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={handlePiP}
          className="rounded-full p-1.5 md:p-2 text-gray-200 transition-colors hover:bg-white/15 hover:text-white"
          title="Picture-in-Picture mode"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Participant Name Placement matching Image 1 */}
      {isSpotlight ? (
        /* Hero Video Card Name: near bottom-left with clean white typography */
        <div className="pointer-events-none absolute bottom-4 left-5 z-20 flex max-w-[85%] items-center gap-2">
          <span className="truncate text-sm md:text-base font-semibold tracking-wide text-[#F5F5F5] drop-shadow-md">
            {participant.name}
          </span>
          {isLocal && (
            <span className="text-[11px] font-medium text-[#B8F58A] bg-[#B8F58A]/15 px-2 py-0.5 rounded-full border border-[#B8F58A]/30">
              You
            </span>
          )}
          {participant.isMuted ? (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
              <MicOff className="w-3 h-3" />
            </div>
          ) : isSpeaking ? (
            <div className="flex items-center gap-1 shrink-0">
              <AudioVisualizer level={audioLevel || 35} isSpeaking={true} barCount={3} />
            </div>
          ) : null}
        </div>
      ) : (
        /* Participant Card Name: bottom-left with subtle background if needed */
        <div className="pointer-events-none absolute bottom-2.5 left-3 z-20 flex max-w-[85%] items-center gap-1.5">
          <span className="truncate text-xs font-medium text-[#F5F5F5] drop-shadow-sm">
            {participant.name}
          </span>
          {isLocal && (
            <span className="text-[10px] text-[#B8F58A] font-normal">
              (You)
            </span>
          )}
          {!participant.isMuted && isSpeaking && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#B8F58A] animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}
