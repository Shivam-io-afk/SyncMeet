import React from 'react';

/**
 * HeadphoneIcon
 * Sleek metallic silver/white over-ear headphone matching the reference UI design.
 */
export function HeadphoneIcon({ className = "w-10 h-10" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="headbandGrad" x1="12" y1="12" x2="52" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.45" stopColor="#E2E8F0" />
          <stop offset="0.8" stopColor="#94A3B8" />
          <stop offset="1" stopColor="#475569" />
        </linearGradient>
        <linearGradient id="earcupGradLeft" x1="10" y1="28" x2="22" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8FAFC" />
          <stop offset="0.5" stopColor="#CBD5E1" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="earcupGradRight" x1="42" y1="28" x2="54" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8FAFC" />
          <stop offset="0.5" stopColor="#CBD5E1" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <filter id="metallicGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#ffffff" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Headband Arch */}
      <path
        d="M 17 34 C 17 19 23 11 32 11 C 41 11 47 19 47 34"
        stroke="url(#headbandGrad)"
        strokeWidth="4.5"
        strokeLinecap="round"
        filter="url(#metallicGlow)"
      />

      {/* Headband top inner shadow */}
      <path
        d="M 23 18 C 26 14 29 13 32 13 C 35 13 38 14 41 18"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Left Ear Cup */}
      <rect
        x="11"
        y="29"
        width="11"
        height="22"
        rx="5.5"
        fill="url(#earcupGradLeft)"
        stroke="#64748B"
        strokeWidth="1"
      />
      {/* Left Ear Cushion Inner Highlight */}
      <rect
        x="13"
        y="31"
        width="4"
        height="18"
        rx="2"
        fill="#FFFFFF"
        opacity="0.5"
      />

      {/* Right Ear Cup */}
      <rect
        x="42"
        y="29"
        width="11"
        height="22"
        rx="5.5"
        fill="url(#earcupGradRight)"
        stroke="#64748B"
        strokeWidth="1"
      />
      {/* Right Ear Cushion Inner Highlight */}
      <rect
        x="47"
        y="31"
        width="4"
        height="18"
        rx="2"
        fill="#FFFFFF"
        opacity="0.5"
      />

      {/* Left Swivel Joint */}
      <circle cx="16.5" cy="29" r="2.5" fill="#E2E8F0" />
      {/* Right Swivel Joint */}
      <circle cx="47.5" cy="29" r="2.5" fill="#E2E8F0" />
    </svg>
  );
}

