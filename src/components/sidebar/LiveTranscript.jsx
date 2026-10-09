import React, { useRef, useEffect, useState } from 'react';
import { Plus, Mic, Sparkles, Trash2 } from 'lucide-react';

export function LiveTranscript({
  currentUser,
  transcripts = [],
  interimText = '',
  isListening = true,
  onAddTranscript,
  onClearTranscripts,
}) {
  const scrollRef = useRef(null);
  const [manualText, setManualText] = useState('');

  // Auto-scroll to bottom on new transcript chunk
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, interimText]);

  const handleAddManual = (e) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    onAddTranscript(currentUser?.name || 'You', manualText.trim());
    setManualText('');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Top Banner */}
      <div className="flex items-center justify-between border-b border-[#ecece7] bg-white px-3.5 py-3 dark:border-[#202636] dark:bg-[#151923]">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isListening ? 'animate-ping bg-[#9bbc6d]' : 'bg-[#b5b7b0] dark:bg-[#585e70]'}`} />
          <span className="text-xs font-semibold text-[#383a34] dark:text-[#f3f4f6]">
            {isListening ? 'Transcription active' : 'Transcription inactive'}
          </span>
        </div>

        {transcripts.length > 0 && (
          <button
            type="button"
            onClick={onClearTranscripts}
            className="rounded-lg p-1 text-[#92958d] transition-colors hover:text-[#b86558] dark:text-[#8d93a3] dark:hover:text-[#f87171]"
            title="Clear transcript history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Transcript Scroll Container */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {transcripts.length === 0 && !interimText && (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[#85887f] dark:text-[#8d93a3]">
            <Mic className={`mb-2 h-8 w-8 text-[#9aab76] dark:text-[#9bbc6d] ${isListening ? 'animate-pulse' : ''}`} />
            <p className="text-xs font-medium text-[#555850] dark:text-[#d1d5db]">
              {isListening ? 'Listening to conversation...' : 'Transcription is not active.'}
            </p>
            <p className="mt-1 max-w-[200px] text-[11px] text-[#92958d] dark:text-[#8d93a3]">
              {isListening
                ? 'Speak into your microphone or add a transcript entry below.'
                : 'Turn on transcription and unmute your microphone to capture speech.'}
            </p>

          </div>
        )}

        {/* Render Finalized Transcript Items */}
        {transcripts.map((item) => (
          <div
            key={item.id}
            className="group rounded-2xl border border-[#ecece7] bg-white p-3 transition-colors hover:bg-[#fafaf8] dark:border-[#202636] dark:bg-[#161a25] dark:hover:bg-[#1c2230]"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e8f1da] text-[9px] font-bold text-[#667c4d] dark:bg-[#1e2e1a] dark:text-[#88c580]">
                  {item.speaker ? item.speaker.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="text-xs font-semibold text-[#697d50] dark:text-[#9bbc6d]">{item.speaker}</span>
              </div>
              <span className="font-mono text-[10px] text-[#92958d] dark:text-[#8d93a3]">{item.timestamp}</span>
            </div>
            <p className="pl-5 text-xs leading-relaxed text-[#50534b] dark:text-[#d1d5db]">{item.text}</p>
          </div>
        ))}

        {/* Real-time Interim Streaming Bubble */}
        {interimText && (
          <div className="animate-pulse rounded-2xl border border-[#e3e9d8] bg-[#f2f5ec] p-3 dark:border-[#283925] dark:bg-[#172418]">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#758b55] dark:text-[#a0c57c]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Transcribing live speech...</span>
            </div>
            <p className="text-xs italic text-[#616b50] dark:text-[#b4d493]">{interimText}</p>
          </div>
        )}
      </div>

      {/* Manual transcript entry */}
      <form onSubmit={handleAddManual} className="flex gap-2 border-t border-[#ecece7] bg-white p-3 dark:border-[#202636] dark:bg-[#151923]">
        <input
          type="text"
          placeholder="Add a transcript line..."
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-[#e8e9e3] bg-[#f7f8f5] px-3 py-2 text-xs text-[#34362f] placeholder-[#999b94] focus:border-[#b1c68a] focus:outline-none dark:border-[#242b3b] dark:bg-[#1a1f2c] dark:text-[#f3f4f6] dark:placeholder-[#6b7280] dark:focus:border-[#9bbc6d]"
        />
        <button
          type="submit"
          className="rounded-xl bg-[#171815] p-2 text-white transition-all hover:bg-[#363831] dark:bg-[#9bbc6d] dark:text-[#12151e] dark:hover:bg-[#88a95c]"
          title="Add dialogue chunk"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
