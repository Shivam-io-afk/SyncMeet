import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, CheckCircle2, ArrowUpRight, Plus, Video, VideoOff, 
  Mic, MicOff, Settings, History, LogIn, Sparkles 
} from 'lucide-react';
import { DAYS_OF_WEEK, SCHEDULED_MEETINGS } from '../../data/mockConferenceData';
import { PermissionModal } from '../lobby/PermissionModal';

export function MeetingDashboard({
  currentUser,
  userMenu,
  mediaState,
  audioLevel,
  isSpeaking,
  onJoinRoom,
  onOpenHistory,
  onOpenAuth,
}) {
  const [selectedDay, setSelectedDay] = useState(25);
  const [customRoomId, setCustomRoomId] = useState('');
  const [currentTimeStr, setCurrentTimeStr] = useState('19:02');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(SCHEDULED_MEETINGS[1]); // Default Development Team

  const videoRef = useRef(null);
  const hasVideoTrack = Boolean(
    mediaState?.stream?.getVideoTracks().some((track) => track.readyState === 'live')
  );

  // Live clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      setCurrentTimeStr(`${hrs}:${mins}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Video attachment
  useEffect(() => {
    const video = videoRef.current;
    if (video && mediaState?.stream && !mediaState?.isVideoDisabled) {
      video.srcObject = mediaState.stream;
      video.play().catch(() => {});
    }
  }, [mediaState?.stream, mediaState?.isVideoDisabled]);

  const handleLaunchMeeting = (meeting) => {
    const roomIdToJoin = meeting?.roomId || `dev-team-${Date.now().toString(36)}`;
    onJoinRoom({
      roomId: roomIdToJoin,
      userName: currentUser?.name || 'Denim',
      isHost: true,
      role: 'host',
    });
  };

  const handleJoinCustom = (e) => {
    e?.preventDefault();
    const finalRoom = customRoomId.trim() || `room-${Math.random().toString(36).substring(2, 8)}`;
    onJoinRoom({
      roomId: finalRoom,
      userName: currentUser?.name || 'Denim',
      isHost: !customRoomId.trim(),
      role: customRoomId.trim() ? 'guest' : 'host',
    });
  };

  const userName = currentUser?.name || 'Denim';
  const userAvatar = currentUser?.avatar || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80';

  return (
    <div className="min-h-screen w-full bg-[#0A0B10] text-white flex justify-center py-4 px-3 sm:py-8 sm:px-6 relative overflow-x-hidden selection:bg-[#FA7268]/30">
      {/* Top Rose/Mauve Ambient Glow matching Image 2 */}
      <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-[#4A3240] via-[#1E1925]/70 to-transparent pointer-events-none select-none z-0" />

      {/* Main Centered Mobile/Desktop Canvas (styled like the phone screen in Image 2 Screen A, responsive up to tablet/desktop) */}
      <div className="w-full max-w-[440px] md:max-w-xl lg:max-w-2xl flex flex-col z-10">
        {/* Top Status Bar: Time & Signals */}
        <div className="w-full flex items-center justify-between px-3 py-1 text-xs text-white/70 font-medium select-none">
          <span>{currentTimeStr}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tracking-tighter">5G</span>
            {/* Cellular Bars */}
            <div className="flex items-end gap-0.5 h-3">
              <span className="w-0.5 h-1 bg-white/70 rounded-full" />
              <span className="w-0.5 h-1.5 bg-white/70 rounded-full" />
              <span className="w-0.5 h-2 bg-white/70 rounded-full" />
              <span className="w-0.5 h-2.5 bg-white/70 rounded-full" />
            </div>
            {/* Battery */}
            <div className="w-5 h-2.5 border border-white/60 rounded-sm p-0.5 flex items-center">
              <div className="w-full h-full bg-white/90 rounded-2xs" />
            </div>
          </div>
        </div>

        {/* User Greeting Bar */}
        <div className="flex items-center justify-between mt-4 px-2">
          <div className="flex items-center gap-3">
            {/* User Profile Avatar */}
            <div className="relative">
              <img
                src={userAvatar}
                alt={userName}
                className="w-12 h-12 rounded-full object-cover shadow-lg ring-2 ring-white/10"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#121319]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Welcome {userName}
              </h2>
              <p className="text-xs text-white/60">
                Let&apos;s get Started
              </p>
            </div>
          </div>

          {/* Right Action Icons: Notification Bell + Menu */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 backdrop-blur-md flex items-center justify-center text-white/80 transition-all relative"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#FA7268]" />
            </button>
            {userMenu}
          </div>
        </div>

        {/* Weekly Calendar Horizontal Strip */}
        <div className="mt-7 px-1">
          <div className="flex items-center justify-between gap-1.5 overflow-x-auto py-1 scrollbar-none select-none">
            {DAYS_OF_WEEK.map((item) => {
              const isSelected = selectedDay === item.date;
              return (
                <button
                  key={item.day}
                  type="button"
                  onClick={() => setSelectedDay(item.date)}
                  className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-2xl transition-all duration-200 min-w-[46px] ${
                    isSelected
                      ? 'bg-[#FA7268] text-white font-bold shadow-lg shadow-[#FA7268]/30 scale-105'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <span className={`text-[10px] tracking-wider mb-1 font-medium ${isSelected ? 'text-white/90' : 'text-white/40'}`}>
                    {item.day}
                  </span>
                  <span className="text-sm font-semibold">
                    {item.date}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scheduled Meetings List Container */}
        <div className="mt-6 rounded-3xl bg-[#181922] border border-white/[0.06] p-4 shadow-xl">
          <div className="space-y-1 divide-y divide-white/[0.04]">
            {SCHEDULED_MEETINGS.map((meeting) => {
              const isSelected = selectedMeeting.id === meeting.id;
              return (
                <div
                  key={meeting.id}
                  onClick={() => setSelectedMeeting(meeting)}
                  role="button"
                  tabIndex={0}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer ${
                    isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div>
                    <h4 className="text-sm font-semibold text-white tracking-wide">
                      {meeting.title}
                    </h4>
                    <p className="text-xs text-white/50 mt-0.5">
                      {meeting.time}
                    </p>
                  </div>

                  {/* Right Status Badge */}
                  <div>
                    {meeting.status === 'completed' && (
                      <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/80">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      </div>
                    )}
                    {meeting.status === 'reminder' && (
                      <span className="text-xs font-semibold text-[#FA7268] bg-[#FA7268]/10 px-2.5 py-1 rounded-full border border-[#FA7268]/20">
                        Reminder
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Active Meeting Card (Coral Gradient with Overlapping Avatars & Launch Arrow) */}
        <div className="mt-5 rounded-3xl p-5 bg-gradient-to-r from-[#FF7E79] to-[#FA6D68] shadow-2xl shadow-[#FA7268]/25 text-white select-none">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                {selectedMeeting.title || 'Development Team'}
              </h3>
              <p className="text-xs text-white/80 mt-0.5 font-medium">
                {selectedMeeting.time || 'Meeting at 14:30'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-5">
            {/* Overlapping Avatar Stack */}
            <div className="flex items-center -space-x-2">
              {selectedMeeting.participants.map((avatarUrl, idx) => (
                <img
                  key={idx}
                  src={avatarUrl}
                  alt="Team member"
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-[#FF7E79] shadow-sm"
                />
              ))}
            </div>

            {/* Launch Button with Upward-Right Arrow ↗ */}
            <button
              type="button"
              onClick={() => handleLaunchMeeting(selectedMeeting)}
              className="w-10 h-10 rounded-full bg-white text-[#FA6D68] shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center font-bold"
              title="Join live meeting"
            >
              <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Instant Meeting / Custom Room Code Bar */}
        <form onSubmit={handleJoinCustom} className="mt-4 flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Enter room code (e.g. dev-team-daily)..."
              value={customRoomId}
              onChange={(e) => setCustomRoomId(e.target.value)}
              className="w-full bg-[#181922] border border-white/10 rounded-2xl px-4 py-3 text-xs md:text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#FA7268] transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-3 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-xs md:text-sm font-semibold text-white transition-all flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4 text-[#FA7268]" />
            <span>New Call</span>
          </button>
        </form>

        {/* Media Hardware Quick Preview Strip */}
        <div className="mt-3 flex items-center justify-between px-2 py-2 text-xs text-white/50">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={mediaState?.toggleAudio}
              className={`flex items-center gap-1 hover:text-white transition-colors ${
                mediaState?.isAudioMuted ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {mediaState?.isAudioMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{mediaState?.isAudioMuted ? 'Mic Off' : 'Mic Active'}</span>
            </button>

            <button
              type="button"
              onClick={mediaState?.toggleVideo}
              className={`flex items-center gap-1 hover:text-white transition-colors ${
                mediaState?.isVideoDisabled ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {mediaState?.isVideoDisabled ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
              <span>{mediaState?.isVideoDisabled ? 'Cam Off' : 'Cam Active'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Devices</span>
            </button>

            <button
              type="button"
              onClick={onOpenHistory}
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </button>
          </div>
        </div>

        {/* Optional Hidden Video Preview Element for Camera Stream Initialization */}
        <div className="hidden">
          <video ref={videoRef} autoPlay playsInline muted />
        </div>

        {/* Device Settings Modal */}
        {showSettings && (
          <PermissionModal
            mediaState={mediaState}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  );
}

