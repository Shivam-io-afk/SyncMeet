import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video, VideoOff, Mic, MicOff, Settings, Sparkles, ArrowRight, Headphones,
  Clock3, ChevronRight, Database, CalendarDays, House, MessagesSquare, ShieldCheck,
} from 'lucide-react';
import { AudioVisualizer } from '../ui/AudioVisualizer';
import { PermissionModal } from './PermissionModal';
import { ScheduleMeetingModal } from './ScheduleMeetingModal';
import { ThemeToggle } from '../common/ThemeToggle';
import { BackgroundSilkWaves } from '../common/BackgroundSilkWaves';
import { dbService } from '../../services/dbService';
import { apiService } from '../../services/apiService';

export function DeviceSetup({
  mediaState,
  audioLevel,
  isSpeaking,
  onJoinRoom,
  onOpenHistory,
  currentUser = null,
  userMenu = null,
  defaultName = '',
  defaultRoomId = '',
}) {
  const [userName, setUserName] = useState(() => {
    try {
      return currentUser?.name || defaultName || sessionStorage.getItem('syncmeet_username') || 'Guest';
    } catch {
      return currentUser?.name || defaultName || 'Guest';
    }
  });

  useEffect(() => {
    if (currentUser?.name) setUserName(currentUser.name);
  }, [currentUser]);

  const [roomId, setRoomId] = useState(() => (
    defaultRoomId || new URLSearchParams(window.location.search).get('room') || ''
  ));
  const [isCreatingNew, setIsCreatingNew] = useState(() => (
    !(defaultRoomId || new URLSearchParams(window.location.search).get('room'))
  ));
  const [showSettings, setShowSettings] = useState(false);
  const [nameError, setNameError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [recentMeetings, setRecentMeetings] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [historySource, setHistorySource] = useState('device');
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  const videoRef = useRef(null);
  const hasVideoTrack = Boolean(
    mediaState.stream?.getVideoTracks().some((track) => track.readyState === 'live')
  );
  const hasAudioTrack = Boolean(
    mediaState.stream?.getAudioTracks().some((track) => track.readyState === 'live')
  );

  const setVideoRef = useCallback((el) => {
    videoRef.current = el;
    if (el && mediaState.stream && !mediaState.isVideoDisabled) {
      el.srcObject = mediaState.stream;
      el.play().catch(() => {});
    }
  }, [mediaState.stream, mediaState.isVideoDisabled]);

  useEffect(() => {
    if (videoRef.current && mediaState.stream && !mediaState.isVideoDisabled) {
      videoRef.current.srcObject = mediaState.stream;
      videoRef.current.play().catch(() => {});
    }
  }, [mediaState.stream, mediaState.isVideoDisabled]);

  const [historyVersion, setHistoryVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setHistoryVersion((v) => v + 1);
    window.addEventListener('syncmeet:history-changed', refresh);
    return () => window.removeEventListener('syncmeet:history-changed', refresh);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setHistoryLoading(true);
    setHistoryError('');
    const accountHistory = Boolean(currentUser && !currentUser.isGuest);
    setHistorySource(accountHistory ? 'account' : 'device');
    const loadHistory = accountHistory
      ? apiService.getRecentMeetings().then(({ meetings }) => meetings || [])
      : dbService.getMeetingHistory();
    loadHistory
      .then((history) => {
        if (!isCurrent) return;
        setRecentMeetings(history.slice(0, 4));
      })
      .catch((error) => {
        console.error('Could not load recent meetings:', error);
        if (isCurrent) setHistoryError('Recent meeting history could not be loaded.');
      })
      .finally(() => {
        if (isCurrent) setHistoryLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [currentUser?.id, currentUser?.isGuest, historyVersion]);

  const handleJoin = async (e) => {
    e?.preventDefault();
    if (isJoining) return;
    if (!userName.trim()) {
      setNameError('Please enter your name to continue');
      return;
    }

    try {
      sessionStorage.setItem('syncmeet_username', userName.trim());
    } catch {
      // Ignore sessionStorage errors
    }

    const finalRoomId = isCreatingNew
      ? `room-${Math.random().toString(36).substring(2, 8)}`
      : roomId.trim();

    if (!finalRoomId) {
      setNameError('Please enter a valid room code');
      return;
    }

    setIsJoining(true);
    try {
      await onJoinRoom({
        userName: userName.trim(),
        roomId: finalRoomId,
        isHost: isCreatingNew,
      });
    } catch (error) {
      console.error('Could not enter the meeting room:', error);
      setNameError(error.message || 'Could not enter the meeting room. Check the room code and try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const selectRecentRoom = (id) => {
    setIsCreatingNew(false);
    setRoomId(id);
    setNameError('');
  };

  const recentMeetingsPanel = (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-[#e8e9e3] bg-white shadow-sm dark:border-white/[0.09] dark:bg-[#15171D] dark:shadow-xl">
      <div className="flex items-center justify-between gap-2 border-b border-[#ecece6] px-4 py-3.5 dark:border-white/[0.08]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f1f4e9] text-[#80985c] dark:bg-[#B8F58A]/10 dark:text-[#B8F58A]">
            <Clock3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xs font-bold text-[#30322c] dark:text-[#F5F5F5]">Recent meetings</h2>
            <p className="text-[10px] text-[#92948d] dark:text-[#A7AFBD]">
              {historySource === 'account' ? 'Your completed meetings' : 'Saved on this device'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenHistory}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-semibold text-[#718b4f] transition-colors hover:bg-[#f1f4e9] dark:text-[#B8F58A] dark:hover:bg-[#B8F58A]/10"
        >
          Archives <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 divide-y divide-[#eff0eb] overflow-y-auto dark:divide-white/[0.06]">
        {historyLoading ? (
          <p className="px-4 py-5 text-center text-xs text-[#85877f] dark:text-[#A7AFBD]">Loading recent meetings…</p>
        ) : historyError ? (
          <p role="status" className="px-4 py-5 text-center text-xs text-[#9a7440] dark:text-[#e0a055]">{historyError}</p>
        ) : recentMeetings.length ? (
          recentMeetings.map((meeting) => (
            <div key={meeting.roomId} className="group flex items-center justify-between gap-2.5 px-4 py-3 transition-colors hover:bg-[#f8f9f5] dark:hover:bg-[#1C1E26]">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-[#3b3d36] dark:text-[#F5F5F5]">
                  {meeting.title || `Meeting ${meeting.roomId}`}
                </p>
                <p className="mt-1 flex min-w-0 items-center gap-1 text-[9px] text-[#92948d] dark:text-[#A7AFBD]">
                  <Database className="h-3 w-3 shrink-0 text-[#8aa767] dark:text-[#B8F58A]" />
                  <span className="truncate font-mono">{meeting.roomId}</span>
                  <span>·</span>
                  <span className="shrink-0">
                    {meeting.transcriptCount || meeting.transcriptsCount || 0} entries
                  </span>
                  <span>·</span>
                  <span className="shrink-0">
                    {new Date(meeting.archivedAt || meeting.endedAt || meeting.createdAt).toLocaleDateString()}
                  </span>
                </p>
              </div>
              {historySource === 'device' && (
                <button
                  type="button"
                  onClick={() => selectRecentRoom(meeting.roomId)}
                  className="shrink-0 rounded-xl border border-[#e5e7df] bg-white px-2.5 py-1.5 text-[9px] font-semibold text-[#555850] transition-colors hover:border-[#cbd7b7] hover:bg-[#f1f4e9] hover:text-[#536a37] dark:border-white/10 dark:bg-[#202023] dark:text-[#F5F5F5] dark:hover:border-[#B8F58A]/50 dark:hover:text-[#B8F58A]"
                  title={`Use ${meeting.roomId} in Join with Code`}
                >
                  Use code
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-xs font-medium text-[#555850] dark:text-[#A7AFBD]">No recent meetings yet</p>
            <p className="mt-1 text-[10px] text-[#92948d] dark:text-[#646A78]">Your saved meeting rooms will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#e5e7eb] p-0 text-[#20211e] dark:bg-[#08090B] dark:text-[#F5F5F5]">
      {/* Background silk waves for dark mode visual depth matching reference image */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-40 dark:opacity-60">
        <BackgroundSilkWaves />
      </div>

      {mediaState.permissionError && (
        <PermissionModal onRetry={() => mediaState.retryStream()} />
      )}

      <div className="relative z-10 flex min-h-dvh w-full flex-col overflow-hidden bg-[#eef0ed]/80 dark:bg-[#08090B]/90 backdrop-blur-[2px]">
        <header className="relative z-30 flex min-h-[62px] shrink-0 items-center justify-between gap-3 border-b border-[#e8e9e5] bg-[#fbfbf8] px-3.5 md:px-5 dark:border-white/[0.08] dark:bg-[#12141A]/90 dark:backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#d8edb5] to-[#f2b59c] text-[#34372e] dark:from-[#B8F58A]/20 dark:to-[#B8F58A]/40 dark:text-[#B8F58A]">
              <Video className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold tracking-tight text-[#282a25] sm:text-sm dark:text-[#F5F5F5]">SyncMeet AI</p>
              <p className="hidden truncate text-[10px] text-[#85877f] sm:block dark:text-[#A7AFBD]">Intelligent video collaboration</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle variant="header" />
            <button
              type="button"
              onClick={() => setScheduleModalOpen(true)}
              aria-label="Schedule meeting"
              title="Schedule meeting"
              className="flex h-9 items-center gap-1.5 rounded-full border border-[#e7e8e3] bg-white px-3 text-[10px] font-semibold text-[#60635b] transition-colors hover:bg-[#f4f5f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 dark:border-white/[0.09] dark:bg-[#15171D] dark:text-[#A7AFBD] dark:hover:bg-[#202023] dark:hover:text-[#F5F5F5]"
            >
              <CalendarDays className="h-3.5 w-3.5 text-[#8aa767] dark:text-[#B8F58A]" />
              <span className="hidden sm:inline">Schedule</span>
            </button>
            {userMenu}
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:flex-row">
          <nav aria-label="Home navigation" className="hidden w-[58px] shrink-0 flex-col items-center gap-3 border-r border-[#e8e9e5] bg-[#fdfdfb] py-4 lg:flex dark:border-white/[0.08] dark:bg-[#12141A]">
            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#d8edb5] to-[#f2b59c] text-[#30332a] dark:from-[#B8F58A]/20 dark:to-[#B8F58A]/40 dark:text-[#B8F58A]">
              <Video className="h-4 w-4" />
            </div>
            <button
              type="button"
              aria-label="Meeting setup"
              aria-current="page"
              title="Meeting setup"
              className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#171815] text-white shadow-sm dark:bg-[#202023] dark:text-[#B8F58A] dark:ring-1 dark:ring-[#B8F58A]/30"
            >
              <House className="h-[17px] w-[17px]" />
            </button>
            <button
              type="button"
              aria-label="Meeting archives"
              title="Meeting archives"
              onClick={onOpenHistory}
              className="flex h-10 w-10 items-center justify-center rounded-[14px] text-[#777a72] transition-colors hover:bg-[#eff0eb] hover:text-[#242620] dark:text-[#A7AFBD] dark:hover:bg-[#1C1E26] dark:hover:text-[#F5F5F5]"
            >
              <CalendarDays className="h-[17px] w-[17px]" />
            </button>
            <div className="mt-auto flex h-9 w-9 items-center justify-center rounded-xl bg-[#f1f2ee] text-[#777a72] dark:bg-[#15171D] dark:text-[#A7AFBD]">
              <MessagesSquare className="h-4 w-4" />
            </div>
          </nav>

          <div className="grid min-h-0 flex-1 grid-cols-1 content-stretch gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(255px,0.78fr)_minmax(0,1.55fr)] lg:gap-4 lg:p-4 xl:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.65fr)] xl:gap-5 xl:p-5 2xl:grid-cols-[minmax(290px,0.8fr)_minmax(0,1.55fr)_minmax(250px,0.78fr)]">
            <aside className="flex min-w-0 flex-col gap-3 sm:gap-4">
              <section className="rounded-[24px] border border-[#e7e8e2] bg-white p-4 shadow-sm sm:p-5 xl:p-5 dark:border-white/[0.09] dark:bg-[#15171D] dark:shadow-xl">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6eadc] bg-[#f5f7ef] px-2.5 py-1 text-[10px] font-medium text-[#748b52] dark:border-white/[0.08] dark:bg-[#202023] dark:text-[#A7AFBD]">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.12em] text-[#a0a198] dark:text-[#A7AFBD]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8aa767] dark:bg-[#B8F58A]" /> Get started
                  </span>
                </div>

                <h1 className="text-[22px] font-bold leading-tight tracking-tight text-[#292b25] sm:text-2xl dark:text-[#F5F5F5]">
                  Welcome{userName.trim() ? `, ${userName.trim()}` : ' to SyncMeet'}
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-[#777a72] dark:text-[#A7AFBD]">
                  Start a high-definition meeting or join with a room code.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-[#e8e9e3] bg-[#f3f4ef] p-1 dark:border-white/[0.08] dark:bg-[#0E1015]">
                  <button
                    type="button"
                    onClick={() => { setIsCreatingNew(true); setNameError(''); }}
                    aria-pressed={isCreatingNew}
                    className={`rounded-lg px-2 py-2.5 text-[10px] font-semibold transition-all sm:text-[11px] ${
                      isCreatingNew
                        ? 'bg-white text-[#30322c] shadow-sm ring-1 ring-inset ring-[#e8e9e3] dark:bg-[#B8F58A] dark:text-[#08090B] dark:font-bold dark:shadow-[0_0_15px_rgba(184,245,138,0.2)]'
                        : 'text-[#85877f] hover:text-[#34362f] dark:text-[#A7AFBD] dark:hover:text-[#F5F5F5]'
                    }`}
                  >
                    Create meeting
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsCreatingNew(false); setNameError(''); }}
                    aria-pressed={!isCreatingNew}
                    className={`rounded-lg px-2 py-2.5 text-[10px] font-semibold transition-all sm:text-[11px] ${
                      !isCreatingNew
                        ? 'bg-white text-[#30322c] shadow-sm ring-1 ring-inset ring-[#e8e9e3] dark:bg-[#B8F58A] dark:text-[#08090B] dark:font-bold dark:shadow-[0_0_15px_rgba(184,245,138,0.2)]'
                        : 'text-[#85877f] hover:text-[#34362f] dark:text-[#A7AFBD] dark:hover:text-[#F5F5F5]'
                    }`}
                  >
                    Join with code
                  </button>
                </div>

                <form onSubmit={handleJoin} className="mt-4 space-y-3.5">
                  <div>
                    <div className="mb-1.5">
                      <label htmlFor="meeting-display-name" className="text-[11px] font-semibold text-[#555850] dark:text-[#A7AFBD]">
                        Your Display Name <span className="text-[#d97868] dark:text-[#ff9b90]">*</span>
                      </label>
                    </div>
                    <input
                      id="meeting-display-name"
                      type="text"
                      placeholder="e.g. Sarah Jenkins"
                      value={userName}
                      onChange={(e) => { setUserName(e.target.value); setNameError(''); }}
                      className="w-full rounded-xl border border-[#e1e3dc] bg-[#fbfbf8] px-3.5 py-2.5 text-xs text-[#34362f] placeholder:text-[#a1a39c] focus:border-[#9bbc6d] focus:outline-none focus:ring-2 focus:ring-[#9bbc6d]/20 dark:border-white/[0.1] dark:bg-[#0E1015] dark:text-[#F5F5F5] dark:placeholder:text-[#646A78] dark:focus:border-[#B8F58A] dark:focus:ring-[#B8F58A]/20"
                    />
                  </div>

                  {!isCreatingNew && (
                    <div>
                      <label htmlFor="meeting-room-code" className="mb-1.5 block text-[11px] font-semibold text-[#555850] dark:text-[#A7AFBD]">
                        Meeting Room Code <span className="text-[#d97868] dark:text-[#ff9b90]">*</span>
                      </label>
                      <input
                        id="meeting-room-code"
                        type="text"
                        placeholder="e.g. room-sync-492"
                        value={roomId}
                        onChange={(e) => { setRoomId(e.target.value); setNameError(''); }}
                        className="w-full rounded-xl border border-[#e1e3dc] bg-[#fbfbf8] px-3.5 py-2.5 font-mono text-xs text-[#34362f] placeholder:text-[#a1a39c] focus:border-[#9bbc6d] focus:outline-none focus:ring-2 focus:ring-[#9bbc6d]/20 dark:border-white/[0.1] dark:bg-[#0E1015] dark:text-[#F5F5F5] dark:placeholder:text-[#646A78] dark:focus:border-[#B8F58A] dark:focus:ring-[#B8F58A]/20"
                      />
                    </div>
                  )}

                  {nameError && (
                    <p role="alert" className="rounded-lg border border-[#f1cbc3] bg-[#fff2ee] px-3 py-2 text-[10px] font-medium text-[#a8453c] dark:border-[#4d2320] dark:bg-[#2a1413] dark:text-[#f87171]">
                      {nameError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isJoining}
                    className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#171815] px-4 py-3 text-[11px] font-semibold tracking-wide text-white shadow-[0_8px_20px_rgba(31,33,28,0.16)] transition-all hover:-translate-y-0.5 hover:bg-[#30322c] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/60 dark:bg-[#B8F58A] dark:text-[#08090B] dark:hover:bg-[#c9f9a4] dark:shadow-[0_0_20px_rgba(184,245,138,0.25)]"
                  >
                    <span>{isJoining ? 'Joining…' : isCreatingNew ? 'Start meeting now' : 'Enter meeting room'}</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </form>
              </section>

              <div className="flex min-h-[210px] 2xl:hidden">
                {recentMeetingsPanel}
              </div>
            </aside>

            <main className="flex min-w-0 flex-col justify-start gap-3 sm:gap-4 2xl:gap-5">
              {/* Hero Video Preview Card: large rounded shape, thin soft lime-green border with restrained glow, bottom gradient, and clean typography */}
              <section className="group relative aspect-video w-full overflow-hidden rounded-[26px] md:rounded-[30px] border border-white/80 bg-[#171a20] shadow-[0_14px_38px_rgba(37,43,34,0.16)] dark:border-[#B8F58A]/85 dark:hover:border-[#B8F58A] dark:shadow-[0_0_24px_rgba(184,245,138,0.12)] dark:hover:shadow-[0_0_32px_rgba(184,245,138,0.22)] transition-all duration-300">
                {!mediaState.isVideoDisabled && hasVideoTrack ? (
                  <video
                    ref={setVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full scale-x-[-1] object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_50%_40%,#41434a_0%,#24262c_52%,#17191f_100%)] text-[#d4d5d7]">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.08]">
                      <VideoOff className="h-7 w-7 text-white/65" />
                    </div>
                    <p className="text-xs font-medium text-white/70">
                      {mediaState.isLoading
                        ? 'Checking camera availability…'
                        : 'Camera preview is off'}
                    </p>
                  </div>
                )}

                {/* Bottom gradient for participant-name readability */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                {/* Top left mic / preview status pill */}
                <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[10px] font-medium text-white/90 shadow-sm backdrop-blur-md sm:left-4 sm:top-4">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isSpeaking ? 'animate-pulse bg-[#B8F58A]' : 'bg-white/60'}`} />
                  <span className="truncate">{isSpeaking ? 'Your mic is picking up sound' : 'Camera & mic preview'}</span>
                </div>

                {/* Bottom left display name with clean white typography */}
                <div className="absolute bottom-4 left-4 min-w-0 text-white sm:bottom-5 sm:left-5">
                  <p className="truncate text-lg font-bold tracking-tight text-[#F5F5F5] sm:text-xl">{userName.trim() || 'Guest'}</p>
                  <p className="mt-0.5 text-[10px] text-[#A7AFBD] sm:text-[11px]">
                    Ready to join · {isCreatingNew ? 'New meeting' : 'Joining a room'}
                  </p>
                </div>

                {/* Bottom right floating controls dock */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-2xl border border-white/15 bg-black/60 p-1.5 shadow-lg backdrop-blur-xl dark:border-white/[0.12] dark:bg-[#15171D]/90 sm:bottom-4 sm:right-4 sm:gap-2 sm:p-2">
                  <button
                    type="button"
                    onClick={mediaState.toggleAudio}
                    aria-label={mediaState.isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
                    title={mediaState.isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors sm:h-10 sm:w-10 ${
                      mediaState.isAudioMuted
                        ? 'bg-[#d94d49]/20 text-[#ff9b90] hover:bg-[#d94d49]/35'
                        : 'bg-white/10 text-white hover:bg-white/20 dark:bg-[#202023] dark:text-[#F5F5F5] dark:hover:bg-[#2c2d32]'
                    }`}
                  >
                    {mediaState.isAudioMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                  <div className="hidden items-center rounded-lg border border-white/10 bg-black/25 px-2 py-1 sm:flex">
                    <AudioVisualizer level={audioLevel} isSpeaking={isSpeaking} barCount={5} />
                  </div>
                  <button
                    type="button"
                    onClick={mediaState.toggleVideo}
                    disabled={mediaState.isLoading}
                    aria-label={mediaState.isLoading
                      ? 'Checking camera availability'
                      : mediaState.isVideoDisabled ? 'Turn on camera' : 'Turn off camera'}
                    title={mediaState.isVideoDisabled ? 'Turn on camera' : 'Turn off camera'}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors disabled:cursor-wait disabled:opacity-50 sm:h-10 sm:w-10 ${
                      mediaState.isVideoDisabled
                        ? 'bg-[#d94d49]/20 text-[#ff9b90] hover:bg-[#d94d49]/35'
                        : 'bg-white/10 text-white hover:bg-white/20 dark:bg-[#202023] dark:text-[#F5F5F5] dark:hover:bg-[#2c2d32]'
                    }`}
                  >
                    {mediaState.isVideoDisabled ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettings((visible) => !visible)}
                    aria-label="Audio and video settings"
                    aria-pressed={showSettings}
                    title="Audio & video settings"
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors sm:h-10 sm:w-10 ${
                      showSettings
                        ? 'bg-[#B8F58A] text-[#08090B]'
                        : 'bg-white/10 text-white hover:bg-white/20 dark:bg-[#202023] dark:text-[#F5F5F5] dark:hover:bg-[#2c2d32]'
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </section>

              {showSettings && (
                <section className="grid grid-cols-1 gap-3 rounded-[20px] border border-[#e7e8e2] bg-white p-4 text-xs shadow-sm sm:grid-cols-2 dark:border-white/[0.09] dark:bg-[#15171D]">
                  <div>
                    <label htmlFor="audio-device" className="mb-1.5 flex items-center gap-1.5 font-medium text-[#6f7269] dark:text-[#A7AFBD]">
                      <Headphones className="h-3.5 w-3.5 text-[#d97868] dark:text-[#ff9b90]" />
                      Microphone
                    </label>
                    <select
                      id="audio-device"
                      value={mediaState.selectedAudioId}
                      onChange={(e) => mediaState.switchAudioDevice(e.target.value)}
                      className="w-full rounded-xl border border-[#e1e3dc] bg-[#fbfbf8] px-3 py-2 text-[#4f514a] focus:border-[#9bbc6d] focus:outline-none focus:ring-2 focus:ring-[#9bbc6d]/20 dark:border-white/[0.1] dark:bg-[#0E1015] dark:text-[#F5F5F5] dark:focus:border-[#B8F58A]"
                    >
                      {mediaState.audioDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${device.deviceId.slice(0, 5)}…`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="video-device" className="mb-1.5 flex items-center gap-1.5 font-medium text-[#6f7269] dark:text-[#A7AFBD]">
                      <Video className="h-3.5 w-3.5 text-[#80985c] dark:text-[#B8F58A]" />
                      Camera
                    </label>
                    <select
                      id="video-device"
                      value={mediaState.selectedVideoId}
                      onChange={(e) => mediaState.switchVideoDevice(e.target.value)}
                      className="w-full rounded-xl border border-[#e1e3dc] bg-[#fbfbf8] px-3 py-2 text-[#4f514a] focus:border-[#9bbc6d] focus:outline-none focus:ring-2 focus:ring-[#9bbc6d]/20 dark:border-white/[0.1] dark:bg-[#0E1015] dark:text-[#F5F5F5] dark:focus:border-[#B8F58A]"
                    >
                      {mediaState.videoDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${device.deviceId.slice(0, 5)}…`}
                        </option>
                      ))}
                    </select>
                  </div>
                </section>
              )}

            </main>

            <aside className="hidden min-w-0 flex-col gap-3 2xl:flex">
              <section className="rounded-[24px] border border-[#e8e9e3] bg-white p-4 shadow-sm dark:border-white/[0.09] dark:bg-[#15171D]">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f1eef8] text-[#8873ae] dark:bg-[#B8F58A]/10 dark:text-[#B8F58A]">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <h2 className="text-xs font-bold text-[#30322c] dark:text-[#F5F5F5]">Quick overview</h2>
                  </div>
                  <ShieldCheck className="h-4 w-4 text-[#91a76d] dark:text-[#B8F58A]" />
                </div>
                <p className="text-[11px] leading-relaxed text-[#777a72] dark:text-[#A7AFBD]">
                  Start a private room or enter a code to join your team. Your camera and microphone stay under your control.
                </p>
                <div className="mt-3 space-y-2 border-t border-[#eff0eb] pt-3 dark:border-white/[0.08]">
                  <div className="flex items-center gap-2 text-[10px] text-[#62655d] dark:text-[#F5F5F5]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#eff4e7] text-[#799252] dark:bg-[#B8F58A]/10 dark:text-[#B8F58A]">
                      <Video className="h-3 w-3" />
                    </span>
                    HD video preview
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[#62655d] dark:text-[#F5F5F5]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f1eef8] text-[#8873ae] dark:bg-[#B8F58A]/10 dark:text-[#B8F58A]">
                      <Sparkles className="h-3 w-3" />
                    </span>
                    AI notes in meetings
                  </div>
                </div>
              </section>
              {recentMeetingsPanel}
            </aside>
          </div>
        </div>

        <footer className="relative z-10 hidden shrink-0 items-center justify-between border-t border-[#e8e9e5] bg-[#fbfbf8] px-5 py-2 text-[9px] text-[#a0a198] sm:flex dark:border-white/[0.08] dark:bg-[#12141A] dark:text-[#A7AFBD]">
          <span>SyncMeet · Your meetings stay in your control</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8aa767] dark:bg-[#B8F58A]" />
            {mediaState.isVideoDisabled ? 'Camera off' : hasVideoTrack ? 'Camera ready' : 'Camera unavailable'}
            <span className="mx-1 text-[#d3d4ce] dark:text-[#374151]">·</span>
            {mediaState.isAudioMuted
              ? 'Microphone muted'
              : hasAudioTrack ? 'Microphone ready' : 'Microphone unavailable'}
          </span>
        </footer>
        <ScheduleMeetingModal
          isOpen={scheduleModalOpen}
          onClose={() => setScheduleModalOpen(false)}
          currentUser={currentUser}
          onJoinScheduled={(meeting) => {
            onJoinRoom({ ...meeting, userName: userName.trim() });
            setScheduleModalOpen(false);
          }}
        />
      </div>
    </div>
  );
}
