import React, { useState, useEffect, useRef } from 'react';
import { Copy, Shield, Users, Sparkles, Radio, Database } from 'lucide-react';
import { ThemeToggle } from '../common/ThemeToggle';

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Continue with browser fallback
    }
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  try {
    input.select();
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard access was denied.');
    }
  } finally {
    input.remove();
  }
}

export function HeaderBar({ 
  roomId, 
  participantCount = 1, 
  isTranscribing = false,
  transcriptionError = '',
  isSpeechSupported = false,
  isTranscriptionEnabled = true,
  isMuted = false,
  isGeneratingNotes = false,
  isHost = false,
  onOpenHistory,
  onOpenHostControls,
  userMenu = null,
}) {
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const copyStatusTimer = useRef(null);

  // Live meeting duration counter
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(copyStatusTimer.current);
    };
  }, []);

  const showCopyStatus = (message) => {
    setCopyStatus(message);
    clearTimeout(copyStatusTimer.current);
    copyStatusTimer.current = setTimeout(() => setCopyStatus(''), 6000);
  };

  const formatTime = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copyRoomLink = async () => {
    const configuredAppUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
    let shareUrl;
    let localOnlyLink = false;
    try {
      const link = configuredAppUrl
        ? new URL(configuredAppUrl)
        : new URL(window.location.origin);
      if (!['http:', 'https:'].includes(link.protocol)) {
        throw new Error('The public app URL must use HTTP or HTTPS.');
      }
      const hostname = link.hostname.replace(/^\[|\]$/g, '');
      localOnlyLink = !configuredAppUrl && ['localhost', '127.0.0.1', '::1'].includes(hostname);
      link.searchParams.set('room', roomId);
      link.hash = '';
      shareUrl = link.toString();
    } catch {
      showCopyStatus(configuredAppUrl
        ? 'VITE_PUBLIC_APP_URL must be a valid absolute HTTP or HTTPS URL.'
        : 'Could not create a valid meeting link.');
      return;
    }

    try {
      await copyToClipboard(shareUrl);
      setCopied(true);
      if (localOnlyLink) {
        showCopyStatus('Link copied! For another device on LAN, open using your computer’s IP address.');
      } else {
        setCopyStatus('');
      }
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showCopyStatus('Could not copy link. Check browser permissions.');
    }
  };

  return (
    <header className="relative z-30 flex h-[58px] shrink-0 items-center justify-between border-b border-[#e8e9e5] bg-[#fbfbf8] px-3 md:px-5 select-none dark:border-white/[0.08] dark:bg-[#12141A]/90 dark:backdrop-blur-md">
      {/* Left: Brand & Room Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#d8edb5] to-[#f2b59c] text-[#34372e] dark:from-[#B8F58A]/20 dark:to-[#B8F58A]/40 dark:text-[#B8F58A]">
            <Radio className="h-4 w-4" />
          </div>
          <span className="hidden text-sm font-bold tracking-tight text-[#282a25] sm:inline-block dark:text-[#F5F5F5]">
            SyncMeet AI
          </span>
        </div>

        <div className="hidden h-4 w-px bg-[#e2e3de] sm:block dark:bg-white/[0.08]" />

        {/* Meeting Timer */}
        <div className="flex items-center gap-1.5 rounded-full border border-[#efc8b7] bg-[#fff6f0] px-2.5 py-1 font-mono text-xs text-[#6d584e] dark:border-white/[0.09] dark:bg-[#15171D] dark:text-[#A7AFBD]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ee7569] dark:bg-[#B8F58A]" />
          <span>{formatTime(elapsedSeconds)}</span>
        </div>
      </div>

      {/* Center: Live AI Transcription status */}
      <div className="hidden md:flex items-center gap-2.5">
        <div
          title={transcriptionError || undefined}
          className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
          transcriptionError
            ? 'bg-[#fff0e8] border-[#f2d5ca] text-[#a44b3e] dark:bg-[#2a1413] dark:border-[#4d2320] dark:text-[#fca5a5]'
            : isTranscribing
            ? 'bg-[#edf4e3] border-[#dce8cb] text-[#657b4a] dark:bg-[#B8F58A]/10 dark:border-[#B8F58A]/30 dark:text-[#B8F58A]'
            : 'bg-[#f2f3ef] border-[#e7e8e3] text-[#777a72] dark:bg-[#15171D] dark:border-white/[0.08] dark:text-[#A7AFBD]'
        }`}>
          <span className={`h-2 w-2 rounded-full ${
            transcriptionError
              ? 'bg-[#d94d49]'
              : isTranscribing ? 'bg-[#9bbc6d] dark:bg-[#B8F58A] animate-pulse' : 'bg-[#b5b7b0] dark:bg-[#585e70]'
          }`} />
          <span>
            {transcriptionError
              ? 'Transcription needs attention'
              : !isSpeechSupported
              ? 'Transcription unavailable'
              : !isTranscriptionEnabled
                ? 'Transcription off'
              : isTranscribing
                ? 'Live Speech-to-Text'
                : isMuted
                  ? 'Paused while muted'
                  : 'Transcription ready'}
          </span>
        </div>

        {isGeneratingNotes && (
          <div className="flex animate-pulse items-center gap-1.5 rounded-full border border-[#e8dcc5] bg-[#f8f3e9] px-3 py-1 text-xs font-medium text-[#897044] dark:border-[#B8F58A]/30 dark:bg-[#B8F58A]/10 dark:text-[#B8F58A]">
            <Sparkles className="h-3.5 w-3.5 text-[#ad925a] dark:text-[#B8F58A]" />
            <span>AI Synthesizing Notes...</span>
          </div>
        )}
      </div>

      {/* Right: Participant Count, Theme Toggle & Quick Actions */}
      <div className="flex items-center gap-2">
        <ThemeToggle variant="header" />

        <button
          type="button"
          onClick={onOpenHistory}
          className="flex items-center gap-1.5 rounded-full border border-[#e7e8e3] bg-white px-3 py-1.5 text-xs font-medium text-[#686b63] transition-all hover:bg-[#f4f5f1] dark:border-white/[0.09] dark:bg-[#15171D] dark:text-[#A7AFBD] dark:hover:bg-[#202023] dark:hover:text-[#F5F5F5]"
          title="Open Database Records"
        >
          <Database className="h-3.5 w-3.5 text-[#8aa767] dark:text-[#B8F58A]" />
          <span className="hidden sm:inline">Archives</span>
        </button>

        <div className="flex items-center gap-1.5 rounded-full border border-[#e7e8e3] bg-white px-3 py-1.5 text-xs font-medium text-[#686b63] dark:border-white/[0.09] dark:bg-[#15171D] dark:text-[#A7AFBD]">
          <Users className="h-3.5 w-3.5 text-[#8aa767] dark:text-[#B8F58A]" />
          <span>{participantCount}</span>
        </div>

        {/* Host Moderation Button */}
        {isHost && (
          <button
            type="button"
            onClick={onOpenHostControls}
            className="flex items-center gap-1.5 rounded-full border border-[#e5d7b7] bg-[#faf5e9] px-3 py-1.5 text-xs font-semibold text-[#826d3f] transition-all hover:bg-[#f4ecd9] active:scale-95 dark:border-white/[0.09] dark:bg-[#15171D] dark:text-[#B8F58A] dark:hover:bg-[#202023]"
            title="Open Host Moderation & Security Panel"
          >
            <Shield className="h-3.5 w-3.5 text-[#a4894e] dark:text-[#B8F58A]" />
            <span className="hidden sm:inline">Host</span>
          </button>
        )}

        {userMenu}

        <button
          type="button"
          onClick={copyRoomLink}
          className="hidden items-center gap-1.5 rounded-full bg-[#171815] px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:bg-[#34362f] active:scale-95 sm:flex dark:bg-[#B8F58A] dark:text-[#08090B] dark:hover:bg-[#c9f9a4] dark:shadow-[0_0_15px_rgba(184,245,138,0.2)]"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>{copied ? 'Copied' : 'Share Link'}</span>
        </button>
      </div>

      {copyStatus && (
        <div role="status" className="absolute top-full right-4 mt-2 max-w-sm rounded-xl border border-amber-500/30 bg-[#161B26] px-3.5 py-2 text-xs text-amber-200 shadow-xl z-50">
          {copyStatus}
        </div>
      )}
    </header>
  );
}
