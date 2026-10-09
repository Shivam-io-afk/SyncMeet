import React, { useState, useEffect } from 'react';
import {
  Bot, CalendarDays, FileText, MessageSquare, PenTool, Radio,
  Shield, Sparkles, Users, ListChecks, BarChart3
} from 'lucide-react';
import { HeaderBar } from './HeaderBar';
import { VideoGrid } from './VideoGrid';
import { ControlDock } from './ControlDock';
import { FloatingReactions } from './FloatingReactions';
import { LiveCaptionsOverlay } from './LiveCaptionsOverlay';
import { HostAdmitBanner } from './HostAdmitBanner';
import { useWebRTC } from '../../hooks/useWebRTC';
import { socketService } from '../../services/socketService';
import { BreakoutRoomsPanel } from './BreakoutRoomsPanel';

export function MeetingRoom({
  session,
  mediaState,
  outboundMediaStream,
  audioLevel,
  isSpeaking,
  onLeaveMeeting,
  sidebarContent = null,
  sidebarOpen = true,
  activeSidebarTab = 'notes',
  onToggleSidebar,
  isGeneratingNotes = false,
  isListening = false,
  isSpeechSupported = false,
  isTranscriptionEnabled = true,
  onToggleTranscription,
  onOpenHistory,
  onOpenHostControls,
  userMenu = null,
  currentUser = null,
  latestTranscript = '',
  latestCaptionSpeaker = '',
  externalReactions = [],
  knockRequests = [],
  onAdmitKnock,
  onDenyKnock,
}) {
  const [pinnedId, setPinnedId] = useState(null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [captionsActive, setCaptionsActive] = useState(true);
  const [reactions, setReactions] = useState([]);

  const { remotePeers } = useWebRTC(outboundMediaStream, session);
  const displayParticipants = remotePeers.map((peer) => ({
    id: peer.user?.id || peer.socketId,
    name: peer.user?.name || 'Participant',
    stream: peer.stream,
    isMuted: peer.isMuted,
    isVideoDisabled: peer.isVideoOff,
    isSpeaking: false,
    isHandRaised: peer.isHandRaised,
    audioLevel: 0,
  }));

  // Handle external incoming reactions from socket
  useEffect(() => {
    if (externalReactions.length > 0) {
      const latest = externalReactions[externalReactions.length - 1];
      setReactions(prev => [...prev, latest]);
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== latest.id));
      }, 3000);
    }
  }, [externalReactions]);

  // Send an emoji reaction
  const handleSendReaction = (emoji) => {
    const newReaction = {
      id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      emoji,
      sender: session?.userName || 'You',
      x: Math.floor(Math.random() * 60) + 20,
      duration: (Math.random() * 0.8 + 2.2).toFixed(2),
    };

    setReactions(prev => [...prev, newReaction]);
    socketService.sendReaction(newReaction);

    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== newReaction.id));
    }, 3000);
  };

  const handleToggleHandRaise = () => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    socketService.toggleHandRaise(nextState);
  };

  const localUser = {
    id: 'local-user',
    name: session?.userName || 'You',
    isMuted: mediaState.isAudioMuted,
    isVideoDisabled: mediaState.isVideoDisabled,
    isHandRaised,
  };
  const navigationItems = [
    { id: 'notes', label: 'AI notes', icon: Sparkles },
    { id: 'transcript', label: 'Transcript', icon: FileText },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'whiteboard', label: 'Whiteboard', icon: PenTool },
    { id: 'agenda', label: 'Agenda', icon: ListChecks },
    { id: 'polls', label: 'Polls', icon: BarChart3 },
    { id: 'ask_ai', label: 'Ask AI', icon: Bot },
    { id: 'breakouts', label: 'Breakouts', icon: Users },
  ];

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#e5e7eb] p-0 text-[#20211e] dark:bg-[#07090e] dark:text-[#f3f4f6]">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#eef0ed] dark:bg-[#0c0e14]">
      {/* Floating Host Admit / Deny Banner for waiting room requests */}
      <HostAdmitBanner
        knockRequests={knockRequests}
        onAdmit={onAdmitKnock}
        onDeny={onDenyKnock}
      />

      {/* Floating Reactions Particle System */}
      <FloatingReactions reactions={reactions} />

      {/* Top Header Bar per Flowdaigram Wireframe 3.2 */}
      <HeaderBar
        roomId={session.roomId}
        participantCount={displayParticipants.length + 1}
        isTranscribing={isListening}
        isSpeechSupported={isSpeechSupported}
        isTranscriptionEnabled={isTranscriptionEnabled}
        isMuted={mediaState.isAudioMuted}
        isGeneratingNotes={isGeneratingNotes}
        isHost={session.isHost || session.role === 'host'}
        onOpenHistory={onOpenHistory}
        onOpenHostControls={onOpenHostControls}
        userMenu={userMenu}
      />

      {/* Meeting navigation and adaptive meeting workspace */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <nav
          aria-label="Meeting tools"
          className="hidden w-[58px] shrink-0 flex-col items-center gap-3 border-r border-[#e8e9e5] bg-[#fdfdfb] py-4 lg:flex dark:border-[#1e2330] dark:bg-[#12151e]"
        >
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#d8edb5] to-[#f2b59c] text-[#30332a]">
            <Radio className="h-4 w-4" />
          </div>
          <div className="flex flex-1 flex-col items-center gap-2">
            {navigationItems.map(({ id, label, icon: Icon }) => {
              const active = sidebarOpen && activeSidebarTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={label}
                  aria-pressed={active}
                  title={label}
                  onClick={() => onToggleSidebar(id)}
                  className={`flex h-10 w-10 items-center justify-center rounded-[14px] transition-all ${
                    active
                      ? 'bg-[#161714] text-white shadow-sm dark:bg-[#222838]'
                      : 'text-[#777a72] hover:bg-[#eff0eb] hover:text-[#242620] dark:text-[#8d93a3] dark:hover:bg-[#1c2230] dark:hover:text-[#f3f4f6]'
                  }`}
                >
                  <Icon className="h-[17px] w-[17px]" />
                </button>
              );
            })}
          </div>
          {(session.isHost || session.role === 'host') && (
            <button
              type="button"
              aria-label="Host controls"
              title="Host controls"
              onClick={onOpenHostControls}
              className="flex h-10 w-10 items-center justify-center rounded-[14px] text-[#777a72] transition-colors hover:bg-[#eff0eb] hover:text-[#242620] dark:text-[#8d93a3] dark:hover:bg-[#1c2230] dark:hover:text-[#f3f4f6]"
            >
              <Shield className="h-[17px] w-[17px]" />
            </button>
          )}
          <button
            type="button"
            aria-label="Meeting archives"
            title="Meeting archives"
            onClick={onOpenHistory}
            className="flex h-10 w-10 items-center justify-center rounded-[14px] text-[#777a72] transition-colors hover:bg-[#eff0eb] hover:text-[#242620] dark:text-[#8d93a3] dark:hover:bg-[#1c2230] dark:hover:text-[#f3f4f6]"
          >
            <CalendarDays className="h-[17px] w-[17px]" />
          </button>
        </nav>

        <section className="hidden w-[210px] shrink-0 flex-col border-r border-[#e8e9e5] bg-[#fdfdfb] px-3.5 py-5 xl:flex dark:border-[#1e2330] dark:bg-[#12151e]">
          <div className="mb-5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8e9188] dark:text-[#737887]">Live meeting</p>
            <h1 className="break-words text-[16px] font-semibold leading-snug text-[#242620] dark:text-[#f3f4f6]">
              {session.title || 'Meeting room'}
            </h1>
            <p className="mt-1 truncate font-mono text-[10px] text-[#898c84] dark:text-[#7e8494]">{session.roomId}</p>
          </div>

          <div className="mb-4 rounded-2xl border border-[#e9ebe5] bg-white p-3.5 dark:border-[#202533] dark:bg-[#161a25]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#363831] dark:text-[#f3f4f6]">Participants</span>
              <span className="rounded-full bg-[#f1f2ee] px-2 py-0.5 text-[10px] font-medium text-[#65685f] dark:bg-[#1f2636] dark:text-[#a0a6b5]">
                {displayParticipants.length + 1}
              </span>
            </div>
            <div className="space-y-2.5">
              {[{ ...localUser, isLocal: true }, ...displayParticipants].map((participant) => (
                <div key={participant.id} className="flex min-w-0 items-center gap-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    participant.isLocal ? 'bg-[#e8f1da] text-[#55683d] dark:bg-[#1f2e1a] dark:text-[#88c580]' : 'bg-[#f4e7dc] text-[#835d43] dark:bg-[#342419] dark:text-[#f4a261]'
                  }`}>
                    {participant.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-medium text-[#34362f] dark:text-[#f3f4f6]">
                      {participant.name}{participant.isLocal ? ' (You)' : ''}
                    </p>
                    <p className="text-[9px] text-[#92958d] dark:text-[#8d93a3]">
                      {participant.isMuted ? 'Muted' : 'Mic on'}
                    </p>
                  </div>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${participant.isMuted ? 'bg-[#d49a8c]' : 'bg-[#9ebf70]'}`} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#e9ebe5] bg-white p-3.5 dark:border-[#202533] dark:bg-[#161a25]">
            <div className="mb-2 flex items-center gap-2 text-[#67744f] dark:text-[#9bbc6d]">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-[11px] font-semibold text-[#363831] dark:text-[#f3f4f6]">Meeting tools</span>
            </div>
            <p className="text-[10px] leading-relaxed text-[#85887f] dark:text-[#9ca3af]">
              Open notes, transcript, chat, or the collaborative whiteboard from the navigation.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[9px] font-medium text-[#70736a] dark:text-[#8d93a3]">
              <span className={`h-1.5 w-1.5 rounded-full ${isListening ? 'bg-[#98b96b]' : 'bg-[#c3c5be] dark:bg-[#4a5060]'}`} />
              {isListening ? 'Transcription active' : 'Transcription paused'}
            </div>
          </div>
        </section>

        <nav
          aria-label="Meeting tools"
          className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#e7e8e3] bg-[#fdfdfb] px-2 py-1.5 scrollbar-none lg:hidden dark:border-[#1e2330] dark:bg-[#12151e]"
        >
          {navigationItems.map(({ id, label, icon: Icon }) => {
            const active = sidebarOpen && activeSidebarTab === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={active}
                title={label}
                onClick={() => onToggleSidebar(id)}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-medium ${
                  active ? 'bg-[#171815] text-white' : 'text-[#777a72] hover:bg-[#eff0eb]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Center: video-first call stage */}
        <main
          className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center bg-[#eff0ec] pb-20"
        >
          <VideoGrid
            localUser={localUser}
            localStream={mediaState.stream}
            localAudioLevel={audioLevel}
            localIsSpeaking={isSpeaking}
            screenStream={mediaState.screenStream}
            isScreenSharing={mediaState.isScreenSharing}
            remoteParticipants={displayParticipants}
            pinnedId={pinnedId}
            onTogglePin={(id) => setPinnedId(prev => prev === id ? null : id)}
          />

          {displayParticipants.length === 0 && (
            <div className="absolute left-1/2 top-4 z-10 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border border-[#e5e7df] bg-white/90 px-4 py-2 text-center text-xs text-[#696c64] shadow-sm backdrop-blur">
              You’re the only participant in this call. Share the meeting link to invite others.
            </div>
          )}

          {/* Live On-Screen Closed Captions (CC) Overlay */}
          <LiveCaptionsOverlay
            isOpen={captionsActive}
            currentSpeaker={latestCaptionSpeaker}
            captionText={latestTranscript}
          />
        </main>

        {/* Right: Existing notes, chat, transcript, and collaboration tools */}
        <aside
          className={`${
            sidebarOpen ? 'flex' : 'hidden'
          } z-20 mb-20 h-[38%] max-h-[40%] min-h-[190px] w-full shrink-0 flex-col border-t border-[#e7e8e3] bg-[#fbfbf8] transition-all duration-300 lg:mb-0 lg:h-full lg:max-h-none lg:min-h-0 lg:w-[340px] lg:border-l lg:border-t-0 xl:w-[360px]`}
        >
          {activeSidebarTab === 'breakouts' ? (
            <BreakoutRoomsPanel
              session={session}
              participants={displayParticipants}
              currentUser={currentUser}
              isHost={Boolean(session.isHost || session.role === 'host')}
            />
          ) : sidebarContent}
        </aside>
      </div>

      {/* Floating Control Dock (Bottom Center) */}
      <ControlDock
        mediaState={mediaState}
        audioLevel={audioLevel}
        isSpeaking={isSpeaking}
        sidebarOpen={sidebarOpen}
        activeSidebarTab={activeSidebarTab}
        onToggleSidebar={onToggleSidebar}
        onLeaveMeeting={onLeaveMeeting}
        isHandRaised={isHandRaised}
        onToggleHandRaise={handleToggleHandRaise}
        onSendReaction={handleSendReaction}
        captionsActive={captionsActive}
        onToggleCaptions={() => setCaptionsActive(!captionsActive)}
        isTranscriptionEnabled={isTranscriptionEnabled}
        isSpeechSupported={isSpeechSupported}
        onToggleTranscription={onToggleTranscription}
      />
      </div>
    </div>
  );
}
