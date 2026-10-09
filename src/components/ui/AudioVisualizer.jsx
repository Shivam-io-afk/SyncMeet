import React from 'react';

export function AudioVisualizer({ level = 0, isSpeaking = false, barCount = 5, className = "" }) {
  // Height coefficients for rhythmic equalizer aesthetic
  const multipliers = [0.4, 0.8, 1.0, 0.7, 0.5];

  return (
    <div className={`flex items-center gap-0.5 h-4 ${className}`}>
      {Array.from({ length: barCount }).map((_, index) => {
        const mult = multipliers[index % multipliers.length];
        const heightPercent = isSpeaking
          ? Math.max(15, Math.min(100, Math.round(level * mult * 1.4)))
          : 12;

        return (
          <div
            key={index}
            className={`w-0.5 rounded-full transition-all duration-75 ${
              isSpeaking
                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                : 'bg-gray-600/40'
            }`}
            style={{ height: `${heightPercent}%` }}
          />
        );
      })}
    </div>
  );
}
