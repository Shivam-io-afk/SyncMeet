import React, { useRef, useEffect, useState } from 'react';
import { 
  Mic, MicOff, Pin, Sparkle, Maximize2, Volume2, Monitor, Hand 
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

  const isHighlighted = isSpeaking || isSpotlight || isPinned;

  return (
    <div
      className={`group relative flex h-full w-full select-none items-center justify-center overflow-hidden rounded-[20px] bg-[#d8dad4] shadow-[0_8px_24px_rgba(51,55,44,0.12)] transition-all duration-300 md:rounded-[24px] ${
        isHighlighted
          ? 'ring-2 ring-[#b9d88d] shadow-[0_0_0_3px_rgba(185,216,141,0.18)]'
          : 'border border-white/80 hover:border-[#c9d6b3]'
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
            className={`w-full h-full object-cover ${
              isLocal && !isScreenShare ? 'scale-x-[-1]' : ''
            } ${getFilterClass()}`}
          />
          {/* Subtle bottom vignette gradient for optimal text contrast */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10" />
        </div>
      ) : (
        /* Video Off Avatar State */
        <div className="flex h-full w-full select-none flex-col items-center justify-center bg-gradient-to-br from-[#eaebe6] to-[#d9dcd4] text-[#656960]">
          <div className="relative">
            {participant.avatar ? (
              <img
                src={participant.avatar}
                alt={participant.name}
                className="h-20 w-20 rounded-full object-cover shadow-xl ring-4 ring-white/80 transition-all group-hover:ring-white md:h-24 md:w-24"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-[#c4de9b] to-[#e6a790] p-0.5 shadow-xl md:h-24 md:w-24">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#f8f8f5] text-xl font-bold tracking-wide text-[#393c33] md:text-2xl">
                  {participant.name ? participant.name.charAt(0).toUpperCase() : 'U'}
                </div>
              </div>
            )}

            {/* Speaking Pulse Ring */}
            {isSpeaking && (
              <span className="absolute -inset-1.5 animate-ping rounded-full border-2 border-[#a9c979] opacity-75" />
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
                    className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs text-white backdrop-blur hover:bg-black/90 shadow-lg border border-white/10"
                    title={`Enable audio from ${participant.name || 'participant'}`}
                  >
                    <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
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
        <div className="absolute left-3.5 top-3.5 z-20 flex items-center gap-1.5 rounded-full border border-white/30 bg-black/55 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
          <Monitor className="h-3.5 w-3.5 text-[#d1e8aa]" />
          <span>Screen Presentation</span>
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
      <div className="absolute right-3.5 top-3.5 z-30 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/55 p-1 opacity-0 shadow-xl backdrop-blur-md transition-opacity group-hover:opacity-100">
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            className={`p-2 rounded-full transition-colors ${
              isPinned ? 'bg-[#b9d88d] text-[#25271f]' : 'text-gray-200 hover:bg-white/15 hover:text-white'
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
            className={`p-2 rounded-full transition-colors ${
              studioEffectEnabled ? 'bg-[#b9d88d] font-bold text-[#25271f]' : 'text-gray-200 hover:bg-white/15 hover:text-white'
            }`}
            title={studioEffectEnabled ? 'Turn off studio visual effect' : 'Turn on studio visual effect'}
          >
            <Sparkle className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={handlePiP}
          className="rounded-full p-2 text-gray-200 transition-colors hover:bg-white/15 hover:text-white"
          title="Picture-in-Picture mode"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating Bottom Left Name Capsule (Google Meet & Linear Grade Glass Pill) */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex max-w-[85%] items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 shadow-lg backdrop-blur-md">
        {participant.isMuted ? (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3a39a]/20 text-[#ffb0a6]">
            <MicOff className="w-3 h-3" />
          </div>
        ) : isSpeaking ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <AudioVisualizer level={audioLevel || 35} isSpeaking={true} barCount={3} />
          </div>
        ) : (
          <div className="h-2 w-2 shrink-0 rounded-full bg-[#c7e7a2]" />
        )}

        <span className="truncate text-xs font-medium tracking-normal text-white md:text-sm">
          {participant.name} {isLocal && <span className="font-normal text-[#d6eab8]">(You)</span>}
        </span>
      </div>
    </div>
  );
}
