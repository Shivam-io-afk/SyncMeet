import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

export function PermissionModal({ onRetry }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#20211e]/40 backdrop-blur-md dark:bg-black/80">
      <div className="p-6 md:p-8 rounded-2xl max-w-md w-full border border-amber-500/30 bg-white text-[#30322c] shadow-2xl animate-in fade-in zoom-in duration-200 dark:bg-[#12151e] dark:text-[#f3f4f6]">
        <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4 dark:text-amber-400">
          <ShieldAlert className="w-6 h-6" />
        </div>
        
        <h2 className="text-xl font-bold text-[#292b25] mb-2 dark:text-white">Camera & Microphone Access Needed</h2>
        <p className="text-sm text-[#777a72] mb-5 leading-relaxed dark:text-gray-300">
          SyncMeet AI requires access to your camera and microphone to enable video calls and generate real-time AI meeting notes.
        </p>

        <div className="bg-[#fbfbf8] rounded-xl p-3.5 border border-[#e1e3dc] mb-6 text-xs text-[#555850] space-y-2 dark:bg-white/[0.04] dark:border-white/10 dark:text-gray-300">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 font-bold dark:text-amber-400">1.</span>
            <span>Click the <strong className="text-[#292b25] dark:text-white">lock or camera icon</strong> in your browser's address bar.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-500 font-bold dark:text-amber-400">2.</span>
            <span>Change permissions for <strong className="text-[#292b25] dark:text-white">Camera & Microphone</strong> to <strong className="text-[#536a37] dark:text-emerald-400">Allow</strong>.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-500 font-bold dark:text-amber-400">3.</span>
            <span>Click the button below to re-check connection.</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRetry}
            className="flex-1 bg-[#171815] hover:bg-[#30322c] text-white font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 dark:bg-[#9bbc6d] dark:text-[#12151e] dark:hover:bg-[#a9c97b]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Access</span>
          </button>
        </div>
      </div>
    </div>
  );
}
