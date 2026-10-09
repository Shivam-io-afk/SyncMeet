import React from 'react';
import { Subtitles, Sparkles } from 'lucide-react';

export function LiveCaptionsOverlay({
  isOpen = true,
  currentSpeaker = '',
  captionText = '',
}) {
  if (!isOpen || !captionText) return null;

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 max-w-2xl w-[90%] pointer-events-none select-none animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="bg-black/85 backdrop-blur-md border border-white/15 px-5 py-3 rounded-2xl shadow-2xl text-center flex items-center justify-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
        <div className="text-left flex-1">
          {currentSpeaker && (
            <span className="text-xs font-bold text-indigo-400 block mb-0.5">
              {currentSpeaker}:
            </span>
          )}
          <p className="text-sm font-medium text-white tracking-wide leading-relaxed">
            {captionText}
          </p>
        </div>
      </div>
    </div>
  );
}
