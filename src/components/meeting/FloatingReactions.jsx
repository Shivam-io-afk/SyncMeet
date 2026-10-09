import React, { useEffect } from 'react';

export function FloatingReactions({ reactions = [] }) {
  if (reactions.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden select-none">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="absolute text-3xl md:text-4xl animate-float-up"
          style={{
            left: `${r.x}%`,
            bottom: '80px',
            animation: `floatUp ${r.duration || 2.5}s cubic-bezier(0.25, 1, 0.5, 1) forwards`,
          }}
        >
          <div className="flex flex-col items-center">
            <span className="filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] transform hover:scale-125 transition-transform">
              {r.emoji}
            </span>
            {r.sender && (
              <span className="text-[10px] font-bold bg-black/70 text-white px-2 py-0.5 rounded-full border border-white/10 mt-1">
                {r.sender}
              </span>
            )}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes floatUp {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.6);
          }
          15% {
            opacity: 1;
            transform: translateY(-40px) scale(1.15);
          }
          75% {
            opacity: 0.9;
            transform: translateY(-260px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-380px) scale(0.85);
          }
        }
      `}</style>
    </div>
  );
}
