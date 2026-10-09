import React from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert, Video, Mic } from 'lucide-react';

export function PermissionModal({ onRetry }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel p-6 md:p-8 rounded-2xl max-w-md w-full border border-amber-500/30 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        
        <h2 className="text-xl font-bold text-white mb-2">Camera & Microphone Access Needed</h2>
        <p className="text-sm text-gray-300 mb-5 leading-relaxed">
          SyncMeet AI requires access to your camera and microphone to enable video calls and generate real-time AI meeting notes.
        </p>

        <div className="bg-white/[0.04] rounded-xl p-3.5 border border-white/10 mb-6 text-xs text-gray-300 space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-amber-400 font-bold">1.</span>
            <span>Click the <strong className="text-white">lock or camera icon</strong> in your browser's address bar.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-400 font-bold">2.</span>
            <span>Change permissions for <strong className="text-white">Camera & Microphone</strong> to <strong className="text-emerald-400">Allow</strong>.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-400 font-bold">3.</span>
            <span>Click the button below to re-check connection.</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRetry}
            className="flex-1 bg-gradient-to-r from-[#ff8586] to-[#e66472] hover:opacity-90 text-white font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#ff777b]/20 active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Access</span>
          </button>
        </div>
      </div>
    </div>
  );
}
