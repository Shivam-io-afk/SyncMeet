import React, { useRef, useState, useEffect } from 'react';
import { MicOff, Volume2 } from 'lucide-react';
import { AudioVisualizer } from '../ui/AudioVisualizer';

/**
 * getParticipantCardPath
 * Generates the vector outline for secondary participant cards with the stepped bottom-left name tab.
 */
function getParticipantCardPath(w, h, r = 20, tw = 135, stepH = 28, cr = 12) {
  if (w <= 0 || h <= 0) return '';
  const tabW = Math.min(tw, Math.max(90, w * 0.64));
  const safeR = Math.min(r, w / 4, (h - stepH) / 4);
  const safeCr = Math.min(cr, tabW / 3, stepH / 2);

  return `
    M ${safeR} 0
    L ${w - safeR} 0
    A ${safeR} ${safeR} 0 0 1 ${w} ${safeR}
    L ${w} ${h - stepH - safeR}
    A ${safeR} ${safeR} 0 0 1 ${w - safeR} ${h - stepH}
    L ${tabW + safeCr} ${h - stepH}
    Q ${tabW} ${h - stepH} ${tabW} ${h - stepH + safeCr}
    L ${tabW} ${h - safeCr}
    Q ${tabW} ${h} ${tabW - safeCr} ${h}
    L ${safeR} ${h}
    A ${safeR} ${safeR} 0 0 1 0 ${h - safeR}
    L 0 ${safeR}
    A ${safeR} ${safeR} 0 0 1 ${safeR} 0
    Z
  `.replace(/\s+/g, ' ').trim();
}

export function ParticipantCard({
  participant,
  stream = null,
  isLocal = false,
  audioLevel = 0,
  isSpeaking = false,
  onClick,
  className = '',
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [dims, setDims] = useState({ width: 220, height: 180 });
  const clipId = `participant-clip-${participant?.id || 'tile'}`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDims({ width: Math.round(width), height: Math.round(height) });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasLiveVideoTrack = stream?.getVideoTracks?.().some((t) => t.readyState === 'live');
  const showVideo = !participant?.isVideoDisabled && (hasLiveVideoTrack || participant?.videoLoop);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hasLiveVideoTrack && stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      video.play().catch(() => {});
    } else if (participant?.videoLoop && !stream) {
      video.srcObject = null;
      video.src = participant.videoLoop;
      video.loop = true;
      video.muted = true;
      video.play().catch(() => {});
    }
  }, [stream, hasLiveVideoTrack, participant?.videoLoop]);

  const pathD = getParticipantCardPath(dims.width, dims.height, 22, 135, 28, 10);

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`relative w-full h-full select-none cursor-pointer transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99] group ${className}`}
      title={`Click to spotlight ${participant?.name || 'participant'}`}
    >
      {/* SVG Definitions for clipping */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            {pathD ? <path d={pathD} /> : null}
          </clipPath>
        </defs>
      </svg>

      {/* Main Clipped Container */}
      <div
        className="w-full h-full relative overflow-hidden bg-[#181920] border border-white/[0.06] shadow-xl"
        style={{
          clipPath: pathD ? `url(#${clipId})` : 'none',
          WebkitClipPath: pathD ? `url(#${clipId})` : 'none',
        }}
      >
        {/* If video stream is active (like Peter Lee) */}
        {showVideo ? (
          <div className="w-full h-full relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isLocal || !hasLiveVideoTrack}
              className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
          </div>
        ) : (
          /* Avatar Mode (like Sarah Paige, Joe Parsons, Luke Smith) */
          <div className="w-full h-full flex flex-col items-center justify-center pb-5 bg-gradient-to-b from-[#1C1D26] to-[#14151C]">
            <div className="relative">
              {participant?.avatar ? (
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden shadow-lg ring-2 ring-white/10 group-hover:ring-white/30 transition-all">
                  <img
                    src={participant.avatar}
                    alt={participant.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#2A2B36] flex items-center justify-center text-xl font-bold text-white shadow-lg ring-2 ring-white/10">
                  {participant?.name?.charAt(0)?.toUpperCase() || 'P'}
                </div>
              )}

              {/* Active voice pulse ring */}
              {isSpeaking && (
                <span className="absolute -inset-1 rounded-full border-2 border-[#A8FF53] animate-ping opacity-75" />
              )}
            </div>
          </div>
        )}

        {/* Top-Left: Subtle Muted Mic Icon */}
        <div className="absolute top-3 left-3 z-20 pointer-events-none">
          {participant?.isMuted ? (
            <MicOff className="w-4 h-4 text-white/50" strokeWidth={1.75} />
          ) : isSpeaking ? (
            <div className="flex items-center gap-1">
              <AudioVisualizer level={audioLevel || 30} isSpeaking={true} barCount={3} />
            </div>
          ) : (
            <Volume2 className="w-4 h-4 text-white/40" strokeWidth={1.5} />
          )}
        </div>

        {/* Bottom-Left Name Label (Inside the extended tab) */}
        <div className="absolute bottom-2 left-3 z-20 pointer-events-none flex items-center gap-1.5 max-w-[80%]">
          <span className="text-xs md:text-sm font-medium text-white truncate tracking-normal">
            {participant?.name || 'Participant'}
          </span>
          {isLocal && (
            <span className="text-[10px] text-emerald-400 font-normal">
              (You)
            </span>
          )}
        </div>
      </div>

      {/* SVG Outline for Subtle Edge Definition */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        viewBox={`0 0 ${dims.width} ${dims.height}`}
        fill="none"
      >
        {pathD && (
          <path
            d={pathD}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1.25"
            className="group-hover:stroke-white/20 transition-colors"
          />
        )}
      </svg>
    </div>
  );
}

