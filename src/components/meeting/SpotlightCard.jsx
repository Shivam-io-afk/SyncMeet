import React, { useRef, useState, useEffect } from 'react';
import { Mic, MicOff, Pin, Sparkle, Maximize2, Volume2 } from 'lucide-react';

/**
 * getSpotlightPath
 * Generates exact vector outline for the spotlight card with the bottom-left cutout tab
 * matching the reference UI design.
 */
function getSpotlightPath(w, h, r = 24, cw = 160, ch = 34, cr = 14) {
  if (w <= 0 || h <= 0) return '';
  const cutW = Math.min(cw, Math.max(110, w * 0.36));
  const cutH = Math.min(ch, Math.max(26, h * 0.16));
  const safeR = Math.min(r, w / 4, h / 4);
  const safeCr = Math.min(cr, cutW / 3, cutH / 2);

  return `
    M ${safeR} 0
    L ${w - safeR} 0
    A ${safeR} ${safeR} 0 0 1 ${w} ${safeR}
    L ${w} ${h - safeR}
    A ${safeR} ${safeR} 0 0 1 ${w - safeR} ${h}
    L ${cutW + safeCr} ${h}
    Q ${cutW} ${h} ${cutW} ${h - safeCr}
    L ${cutW} ${h - cutH + safeCr}
    Q ${cutW} ${h - cutH} ${cutW - safeCr} ${h - cutH}
    L ${safeR} ${h - cutH}
    A ${safeR} ${safeR} 0 0 1 0 ${h - cutH - safeR}
    L 0 ${safeR}
    A ${safeR} ${safeR} 0 0 1 ${safeR} 0
    Z
  `.replace(/\s+/g, ' ').trim();
}

export function SpotlightCard({
  participant,
  stream = null,
  isLocal = false,
  isScreenShare = false,
  audioLevel = 0,
  isSpeaking = false,
  isPinned = false,
  onTogglePin,
  className = '',
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [dims, setDims] = useState({ width: 640, height: 380 });
  const [bgFilter, setBgFilter] = useState('none');
  const clipId = `spotlight-clip-${participant?.id || 'main'}`;

  // Observe container size for sharp vector path
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

  // Connect WebRTC stream or demo video loop
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

  const pathD = getSpotlightPath(dims.width, dims.height, 26, 170, 36, 14);

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

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full select-none group flex items-center justify-center ${className}`}
    >
      {/* SVG Definitions for dynamic clip path */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            {pathD ? <path d={pathD} /> : null}
          </clipPath>
        </defs>
      </svg>

      {/* Main Clipped Media Content Container */}
      <div
        className="w-full h-full relative overflow-hidden bg-[#121319]"
        style={{
          clipPath: pathD ? `url(#${clipId})` : 'none',
          WebkitClipPath: pathD ? `url(#${clipId})` : 'none',
        }}
      >
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal || !hasLiveVideoTrack}
            className={`w-full h-full object-cover ${
              isLocal && !isScreenShare ? 'scale-x-[-1]' : ''
            } ${
              bgFilter === 'blur'
                ? 'filter backdrop-blur-xl contrast-110'
                : bgFilter === 'studio'
                ? 'filter contrast-125 saturate-110'
                : ''
            }`}
          />
        ) : (
          /* Participant Avatar / Fallback */
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1b24] to-[#0e0f14]">
            {participant?.avatar ? (
              <img
                src={participant.avatar}
                alt={participant.name}
                className="w-28 h-28 md:w-36 md:h-36 rounded-full object-cover shadow-2xl ring-4 ring-white/10"
              />
            ) : (
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-tr from-[#FA7268] to-[#FF9E96] p-0.5 shadow-2xl flex items-center justify-center">
                <div className="w-full h-full rounded-full bg-[#181922] flex items-center justify-center text-3xl font-bold text-white">
                  {participant?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Soft bottom vignette overlay inside the video for contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

        {/* Speaking indicator glow inside the video */}
        {isSpeaking && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#A8FF53]/20 border border-[#A8FF53]/60 backdrop-blur-md shadow-lg shadow-[#A8FF53]/20">
            <span className="w-2 h-2 rounded-full bg-[#A8FF53] animate-pulse" />
            <span className="text-[11px] font-semibold text-[#A8FF53]">Speaking</span>
          </div>
        )}
      </div>

      {/* SVG Neon Lime-Green Border Outline (#A8FF53) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        viewBox={`0 0 ${dims.width} ${dims.height}`}
        fill="none"
      >
        {pathD && (
          <>
            {/* Outer soft ambient glow */}
            <path
              d={pathD}
              stroke="#A8FF53"
              strokeWidth="5"
              strokeOpacity="0.25"
              strokeLinejoin="round"
              className="transition-all duration-300"
            />
            {/* Crisp inner neon stroke */}
            <path
              d={pathD}
              stroke="#A8FF53"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-all duration-300 drop-shadow-[0_0_8px_rgba(168,255,83,0.65)]"
            />
          </>
        )}
      </svg>

      {/* Participant Name in Bottom-Left Notch Cutout */}
      <div className="absolute bottom-1.5 left-2 z-20 flex items-center gap-2 pointer-events-auto">
        <span className="text-sm md:text-base font-semibold text-white tracking-wide drop-shadow-md">
          {participant?.name || 'Alison Roberts'}
        </span>
        {isLocal && (
          <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            You
          </span>
        )}
      </div>

      {/* Hover action bar (Pin, Filters, PiP) */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 bg-black/70 backdrop-blur-md p-1.5 rounded-xl border border-white/10 z-30">
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg transition-colors ${
              isPinned ? 'bg-[#A8FF53] text-black font-bold' : 'text-gray-300 hover:text-white hover:bg-white/15'
            }`}
            title={isPinned ? 'Unpin' : 'Pin to spotlight'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        )}

        {isLocal && (
          <button
            type="button"
            onClick={() => setBgFilter(prev => prev === 'none' ? 'blur' : prev === 'blur' ? 'studio' : 'none')}
            className={`p-1.5 rounded-lg transition-colors ${
              bgFilter !== 'none' ? 'bg-[#A8FF53] text-black' : 'text-gray-300 hover:text-white hover:bg-white/15'
            }`}
            title={`Visual Effect: ${bgFilter.toUpperCase()}`}
          >
            <Sparkle className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={handlePiP}
          className="p-1.5 text-gray-300 hover:text-white hover:bg-white/15 rounded-lg transition-colors"
          title="Picture-in-Picture"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

