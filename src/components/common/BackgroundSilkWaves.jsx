import React from 'react';

/**
 * BackgroundSilkWaves
 * Renders the faint, luxurious metallic silk ribbon waves along the lower third of the stage
 * as seen in the reference UI screenshots.
 */
export function BackgroundSilkWaves() {
  return (
    <div className="absolute inset-x-0 bottom-0 h-72 pointer-events-none overflow-hidden select-none z-0">
      <svg
        viewBox="0 0 1440 320"
        fill="none"
        preserveAspectRatio="none"
        className="w-full h-full opacity-40 mix-blend-screen"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="silkWave1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2A2C38" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#1C1D26" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0B0C10" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="silkWave2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3B3D4F" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#1E202B" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0B0C10" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="silkRidge" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="30%" stopColor="#FFFFFF" stopOpacity="0.08" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.22" />
            <stop offset="70%" stopColor="#FFFFFF" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Back silk drape */}
        <path
          d="M -100 240 C 250 140, 550 310, 900 200 C 1200 110, 1400 260, 1600 220 L 1600 360 L -100 360 Z"
          fill="url(#silkWave1)"
        />

        {/* Mid primary silk wave */}
        <path
          d="M -50 280 C 320 200, 680 120, 1050 260 C 1250 330, 1420 230, 1550 260 L 1550 360 L -50 360 Z"
          fill="url(#silkWave2)"
        />

        {/* Highlighting sheen line on ridge */}
        <path
          d="M 120 270 C 420 180, 720 120, 1060 250 C 1260 320, 1380 250, 1500 260"
          stroke="url(#silkRidge)"
          strokeWidth="2.5"
          fill="none"
        />
      </svg>
    </div>
  );
}

