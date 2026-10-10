import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useMediaDevices } from './hooks/useMediaDevices';
import { useAudioVisualizer } from './hooks/useAudioVisualizer';
import { useSpeechToText } from './hooks/useSpeechToText';
import { generateAIMeetingNotes } from './services/geminiService';
import { dbService } from './services/dbService';
import { cryptoAuthService } from './services/cryptoAuthService';
import { apiService } from './services/apiService';
import { socketService } from './services/socketService';
import { LoginPage } from './components/auth/LoginPage';
import { DeviceSetup } from './components/lobby/DeviceSetup';
import { WaitingRoomScreen } from './components/lobby/WaitingRoomScreen';
import { MeetingRoom } from './components/meeting/MeetingRoom';
import { SidebarContainer } from './components/sidebar/SidebarContainer';
import { MeetingHistoryModal } from './components/history/MeetingHistoryModal';
import { HostControlsModal } from './components/meeting/HostControlsModal';
import { UserProfileModal } from './components/auth/UserProfileModal';
import { UserMenu } from './components/auth/UserMenu';
import { ThemeProvider } from './context/ThemeContext';

const ACTIVE_MEETING_KEY = 'syncmeet_active_meeting_v1';

function getSavedMeetingSession() {
  try {
    const saved = sessionStorage.getItem(ACTIVE_MEETING_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (
      typeof parsed.roomId !== 'string'
      || !parsed.roomId.trim()
      || typeof parsed.userName !== 'string'
      || !parsed.userName.trim()
    ) {
      sessionStorage.removeItem(ACTIVE_MEETING_KEY);
      return null;
    }

    return {
      roomId: parsed.roomId.trim(),
      userName: parsed.userName.trim(),
      isHost: Boolean(parsed.isHost),
      role: typeof parsed.role === 'string' ? parsed.role : 'guest',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      agenda: Array.isArray(parsed.agenda) ? parsed.agenda : [],
      templateId: typeof parsed.templateId === 'string' ? parsed.templateId : 'general',
      parentRoomId: typeof parsed.parentRoomId === 'string' ? parsed.parentRoomId : '',
      groupName: typeof parsed.groupName === 'string' ? parsed.groupName : '',
      roomAccessToken: typeof parsed.roomAccessToken === 'string' ? parsed.roomAccessToken : '',
    };
  } catch (err) {
    console.warn('Could not restore the active meeting:', err);
    sessionStorage.removeItem(ACTIVE_MEETING_KEY);
    return null;
  }
}

function AppContent() {
  // 2. Cryptographic Authentication & User State
  const [currentUser, setCurrentUser] = useState(() => cryptoAuthService.getSessionUser());
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  // Start unauthenticated visitors at sign-in; an explicit guest session can go straight to the lobby.
  const [viewMode, setViewMode] = useState(() => currentUser ? 'lobby' : 'login');

  // Verify and sync authenticated user from backend database on mount
  useEffect(() => {
    let isCurrent = true;
    apiService.getCurrentUser().then((res) => {
      if (!isCurrent) return;
      if (res?.success && res?.user) {
        const u = res.user;
        const serverUser = {
          id: u.id || u._id,
          name: u.name,
          email: u.email,
          role: u.role || 'member',
          avatar: u.avatar || '',
          title: u.role === 'host' ? 'Meeting Host' : 'Team Member',
          avatarColor: 'from-indigo-600 to-cyan-500',
        };
        setCurrentUser(serverUser);
        cryptoAuthService.syncSessionUser(serverUser);
        setViewMode('lobby');
      }
    }).catch(() => {
      // Unauthenticated or offline
    });
    return () => { isCurrent = false; };
  }, []);

  // 3. Meeting Session & Waiting Room State
  const [session, setSession] = useState(getSavedMeetingSession);
  const [isWaitingInLobby, setIsWaitingInLobby] = useState(false);
  const [pendingJoinSession, setPendingJoinSession] = useState(null);
  const [knockRequests, setKnockRequests] = useState([]);

  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [activeSidebarTab, setActiveSidebarTab] = useState('notes');
  const [notesData, setNotesData] = useState(null);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [externalReactions, setExternalReactions] = useState([]);
  const [isTranscriptionEnabled, setIsTranscriptionEnabled] = useState(true);
  const [meetingDataReady, setMeetingDataReady] = useState(false);
  const [liveCaption, setLiveCaption] = useState(null);
  const captionTimeoutRef = useRef(null);

  // 4. RBAC & Host Moderation State
  const [hostControlsOpen, setHostControlsOpen] = useState(false);
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [requireWaitingRoom, setRequireWaitingRoom] = useState(false);
  // 5. In-Meeting Chat Messages State
  const [chatMessages, setChatMessages] = useState([]);

  useEffect(() => {
    if (!session?.roomId) {
      sessionStorage.removeItem(ACTIVE_MEETING_KEY);
      apiService.clearActiveRoomAccess();
      return;
    }

    const accessRoomId = session.parentRoomId || session.roomId;
    if (session.roomAccessToken) {
      apiService.setActiveRoomAccess(accessRoomId, {
        token: session.roomAccessToken,
        role: session.isHost ? 'host' : 'participant',
      });
    }
    sessionStorage.setItem(ACTIVE_MEETING_KEY, JSON.stringify({
      roomId: session.roomId,
      userName: session.userName,
      isHost: Boolean(session.isHost),
      role: session.role || 'guest',
      title: session.title || '',
      agenda: session.agenda || [],
      templateId: session.templateId || 'general',
      parentRoomId: session.parentRoomId || '',
      groupName: session.groupName || '',
      roomAccessToken: session.roomAccessToken || '',
    }));
  }, [session]);

  // On mount with restored meeting session, rehydrate authoritative state from backend
  useEffect(() => {
    const saved = getSavedMeetingSession();
    if (!saved?.roomId) return;

    let isCurrent = true;
    apiService.getRoomState(saved.roomId).then((res) => {
      if (!isCurrent) return;
      if (res?.success && res?.state) {
        setIsRoomLocked(Boolean(res.state.isLocked));
        setSession((prev) => {
          if (!prev || prev.roomId !== res.state.roomId) return prev;
          return {
            ...prev,
            title: res.state.title || prev.title,
            agenda: res.state.agenda || prev.agenda,
            isHost: res.state.caller?.isHost ?? prev.isHost,
            role: res.state.caller?.role ?? prev.role,
          };
        });
      } else {
        sessionStorage.removeItem(ACTIVE_MEETING_KEY);
        apiService.clearActiveRoomAccess();
        setSession(null);
      }
    }).catch((err) => {
      console.warn('Could not rehydrate room state on mount:', err.message);
      if (err.message?.includes('inactive') || err.message?.includes('not found') || err.message?.includes('404')) {
        sessionStorage.removeItem(ACTIVE_MEETING_KEY);
        apiService.clearActiveRoomAccess();
        setSession(null);
      }
    });

    return () => { isCurrent = false; };
  }, []);

  // 6. Hardware Media Devices Hook
  const mediaState = useMediaDevices({ enabled: viewMode !== 'login' });
  const mediaStateRef = useRef(mediaState);
  mediaStateRef.current = mediaState;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // 7. Web Audio API RMS Equalizer & Speaking Detector
  const { audioLevel, isSpeaking } = useAudioVisualizer(mediaState.stream, mediaState.isAudioMuted);
  const outboundMediaStream = useMemo(() => {
    const audioTracks = mediaState.stream?.getAudioTracks() || [];
    const videoTracks = mediaState.isScreenSharing && mediaState.screenStream
      ? mediaState.screenStream.getVideoTracks()
      : mediaState.stream?.getVideoTracks() || [];
    return new MediaStream([...audioTracks, ...videoTracks]);
  }, [mediaState.stream, mediaState.screenStream, mediaState.isScreenSharing]);

  const showLiveCaption = useCallback((entry) => {
    if (!entry?.text) return;
    if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
    setLiveCaption({ speaker: entry.speaker || 'Participant', text: entry.text });
    captionTimeoutRef.current = setTimeout(() => {
      setLiveCaption(null);
      captionTimeoutRef.current = null;
    }, 6000);
  }, []);

  const persistTranscriptEntry = useCallback((entry) => {
    const meetingRoomId = session?.parentRoomId || session?.roomId;
    if (!meetingRoomId) return;

    showLiveCaption(entry);
    dbService.saveTranscript(meetingRoomId, entry).catch((err) => {
      console.warn('Local transcript save failed:', err.message);
    });
    socketService.connect();
    socketService.sendCaptionStream({
      speaker: entry.speaker,
      text: entry.text,
      timestamp: entry.timestamp,
    });
  }, [session?.roomId, session?.parentRoomId, showLiveCaption]);

  // 8. Streaming Speech-to-Text Recognition Hook (Active ONLY when in-meeting)
  const {
    transcripts,
    interimText,
    isListening,
    isSupported: isSpeechSupported,
    transcriptionError,
    addTranscriptEntry: internalAddTranscript,
    restoreTranscripts,
    clearTranscripts,
  } = useSpeechToText(
    mediaState.isAudioMuted,
    currentUser?.name || 'You',
    Boolean(session) && meetingDataReady && isTranscriptionEnabled,
    persistTranscriptEntry
  );

  useEffect(() => {
    const meetingRoomId = session?.parentRoomId || session?.roomId;
    if (!meetingRoomId) {
      setMeetingDataReady(false);
      return undefined;
    }

    let cancelled = false;
    setMeetingDataReady(false);
    dbService.getRoomMeetingData(meetingRoomId).then(async ({ transcripts: savedTranscripts, notes }) => {
      if (cancelled) return;
      restoreTranscripts(savedTranscripts);
      let restoredNotes = notes;
      let restoredAgenda = session.agenda || [];
      const remoteData = await Promise.allSettled([
        apiService.getMeetingNotes(meetingRoomId),
        apiService.getMeetingAgenda(meetingRoomId),
      ]);
      if (cancelled) return;
      if (remoteData[0].status === 'fulfilled' && remoteData[0].value.notes) {
        restoredNotes = remoteData[0].value.notes;
      } else if (remoteData[0].status === 'rejected') {
        console.warn('Cloud meeting notes could not be restored:', remoteData[0].reason.message);
      }
      if (remoteData[1].status === 'fulfilled' && remoteData[1].value.agenda?.length) {
        restoredAgenda = remoteData[1].value.agenda;
      } else if (remoteData[1].status === 'rejected') {
        console.warn('Cloud meeting agenda could not be restored:', remoteData[1].reason.message);
      }
      setNotesData(restoredNotes);
      setSession((current) => current?.roomId === session.roomId ? { ...current, agenda: restoredAgenda } : current);
      setMeetingDataReady(true);
    }).catch((err) => {
      console.warn('Could not restore meeting data:', err.message);
      if (!cancelled) setMeetingDataReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [session?.roomId, session?.parentRoomId, restoreTranscripts]);

  const addTranscriptEntry = useCallback((speaker, text) => {
    const entry = internalAddTranscript(speaker, text);
    persistTranscriptEntry(entry);
  }, [internalAddTranscript, persistTranscriptEntry]);

  const meetingSnapshotRef = useRef(null);
  meetingSnapshotRef.current = { session, currentUser, transcripts, notesData };

  const saveMeetingHistory = useCallback(async () => {
    const snapshot = meetingSnapshotRef.current;
    const meetingRoomId = snapshot?.session?.parentRoomId || snapshot?.session?.roomId;
    if (!meetingRoomId || (snapshot.session.role !== 'host' && !snapshot.session.isHost)) return;
    try {
      await apiService.saveMeeting({
        roomId: meetingRoomId,
        title: snapshot.session.title || `Meeting ${meetingRoomId}`,
        hostName: snapshot.currentUser?.name || snapshot.session.userName,
        transcripts: snapshot.transcripts,
        aiNotes: snapshot.notesData,
      });
    } catch (e) {
      console.warn('Save history on exit warning:', e);
    }
  }, []);

  const finishMeeting = useCallback(async () => {
    socketService.leaveRoom();
    try {
      await saveMeetingHistory();
    } catch (e) {
      console.warn('Could not save meeting archive before exit:', e);
    }
    sessionStorage.removeItem(ACTIVE_MEETING_KEY);
    apiService.clearActiveRoomAccess();
    if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
    captionTimeoutRef.current = null;
    setLiveCaption(null);
    setNotesData(null);
    clearTranscripts();
    setMeetingDataReady(false);
    setSession(null);
  }, [clearTranscripts, saveMeetingHistory]);

  const handleClearTranscripts = useCallback(async () => {
    const meetingRoomId = session?.parentRoomId || session?.roomId;
    if (!meetingRoomId) return;
    try {
      const cleared = await dbService.clearTranscripts(meetingRoomId);
      if (!cleared) throw new Error('Local transcript storage is unavailable.');
      clearTranscripts();
      setLiveCaption(null);
      if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
      captionTimeoutRef.current = null;
    } catch (err) {
      console.error('Could not clear transcript history:', err);
      window.alert('Transcript history could not be cleared. Please try again.');
    }
  }, [clearTranscripts, session?.roomId, session?.parentRoomId]);

  // Handle In-Room Chat Message Sending & Socket Broadcast
  const handleSendChatMessage = useCallback((text) => {
    const newMsg = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderId: currentUser?.id || 'guest',
      senderSocketId: socketService.getSocketId(),
      senderName: currentUser?.name || 'You',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages(prev => [...prev, newMsg]);
    socketService.sendChatMessage(newMsg);
  }, [currentUser]);

  const handleUpdateNotes = useCallback(async (nextNotes) => {
    const meetingRoomId = session?.parentRoomId || session?.roomId;
    if (!meetingRoomId) return;
    setNotesData(nextNotes);
    try {
      const saved = await dbService.saveAINotes(meetingRoomId, nextNotes);
      if (!saved) throw new Error('Local notes storage is unavailable.');
    } catch (error) {
      console.error('Could not save notes locally:', error);
      window.alert('Your action item changes could not be saved on this device.');
      return;
    }
    try {
      await apiService.saveMeetingNotes(meetingRoomId, nextNotes);
    } catch (error) {
      console.warn('Cloud action-item sync failed:', error.message);
    }
  }, [session?.roomId, session?.parentRoomId]);

  const handleAgendaChange = useCallback((agenda) => {
    const meetingRoomId = session?.parentRoomId || session?.roomId;
    if (!meetingRoomId) return;
    setSession((current) => current?.roomId === session.roomId ? { ...current, agenda } : current);
    socketService.updateMeetingAgenda(agenda);
    apiService.saveMeetingAgenda(meetingRoomId, agenda).catch((error) => {
      console.warn('Cloud meeting agenda sync failed:', error.message);
    });
    dbService.saveRoom({ roomId: meetingRoomId, title: session.title, agenda }).catch((error) => {
      console.warn('Local meeting agenda sync failed:', error.message);
    });
  }, [session?.roomId, session?.parentRoomId, session?.title]);

  // Direct room entry executor
  const executeJoinRoom = useCallback(async (sessionData, joiningUser = currentUser) => {
    const hostStatus = sessionData.roomAccessRole === 'host';
    const finalSession = {
      ...sessionData,
      isHost: hostStatus,
      role: hostStatus ? 'host' : (joiningUser?.role || 'guest'),
    };
    delete finalSession.joiningUser;
    delete finalSession.roomAccessRole;
    if (finalSession.roomAccessToken) {
      apiService.setActiveRoomAccess(finalSession.parentRoomId || finalSession.roomId, {
        token: finalSession.roomAccessToken,
        role: hostStatus ? 'host' : 'participant',
      });
    }

    clearTranscripts();
    setNotesData(null);
    setMeetingDataReady(false);
    setLiveCaption(null);
    setSession(finalSession);
    setChatMessages([]);
    setIsWaitingInLobby(false);
    setPendingJoinSession(null);

    const roomRecord = {
      roomId: finalSession.roomId,
      title: finalSession.title || `Meeting ${finalSession.roomId}`,
      hostName: joiningUser?.name || finalSession.userName,
      hostId: joiningUser?.id || 'host_01',
      createdAt: Date.now(),
      agenda: finalSession.agenda || [],
    };

    try {
      await dbService.saveRoom(roomRecord);
    } catch (e) {
      console.warn('Local room persistence error:', e.message);
    }

  }, [clearTranscripts, currentUser]);

  // Handle Join Room request from Lobby
  const handleJoinRoom = async (newSession) => {
    const joiningUser = currentUser || cryptoAuthService.createGuestSession(newSession.userName);
    if (!currentUser) setCurrentUser(joiningUser);
    let meetingSession = newSession;
    if (!newSession.title) {
      try {
        const { meeting } = await apiService.getScheduledMeeting(newSession.roomId);
        meetingSession = {
          ...newSession,
          title: meeting.title,
          agenda: meeting.agenda || [],
          templateId: meeting.templateId,
          isHost: meeting.createdBy === joiningUser.id,
        };
      } catch (error) {
        if (!error.message?.includes('Scheduled meeting not found')) {
          console.warn('Scheduled meeting details could not be loaded:', error.message);
        }
      }
    }
    let access = apiService.getRoomAccessToken(meetingSession.roomId);
    if (meetingSession.isHost && !access) {
      const created = await apiService.createGuestRoom({
        title: meetingSession.title || `Meeting ${meetingSession.roomId}`,
        hostName: meetingSession.userName || joiningUser.name,
      });
      meetingSession = { ...meetingSession, roomId: created.room.roomId, title: created.room.title };
      setIsRoomLocked(Boolean(created.room.isLocked));
      access = created.access;
    } else if (!access || access.role !== 'host') {
      const joined = await apiService.joinMeetingRoom(meetingSession.roomId, meetingSession.userName || joiningUser.name);
      access = joined.access;
      meetingSession = { ...meetingSession, requiresAdmission: joined.requiresAdmission };
    } else {
      apiService.setActiveRoomAccess(meetingSession.roomId, access);
    }

    const sessionWithUser = {
      ...meetingSession,
      isHost: access.role === 'host',
      roomAccessRole: access.role,
      roomAccessToken: access.token,
      joiningUser,
    };
    const isHost = access.role === 'host';

    if ((isRoomLocked || requireWaitingRoom || meetingSession.requiresAdmission) && !isHost) {
      setIsWaitingInLobby(true);
      setPendingJoinSession(sessionWithUser);

      socketService.connect();
      socketService.knockRoom(meetingSession.roomId, {
        id: access.participantId,
        name: newSession.userName || joiningUser.name,
        email: joiningUser.email,
        parentRoomId: meetingSession.roomId,
      }, access.token);

      return;
    }

    executeJoinRoom(sessionWithUser, joiningUser);
  };

  // Keep exactly one response listener for the active waiting-room request.
  useEffect(() => {
    if (!isWaitingInLobby || !pendingJoinSession) return;

    const handleKnockResponse = ({ approved, message }) => {
      if (approved) {
        executeJoinRoom(pendingJoinSession, pendingJoinSession.joiningUser);
      } else {
        alert(message || 'Host denied your request to join.');
        setIsWaitingInLobby(false);
        setPendingJoinSession(null);
      }
    };

    socketService.on('knock-response', handleKnockResponse);
    return () => socketService.off('knock-response', handleKnockResponse);
  }, [isWaitingInLobby, pendingJoinSession, executeJoinRoom]);

  // Setup Socket.io Event Subscriptions when session is active
  useEffect(() => {
    if (!session?.roomId) return;

    socketService.connect();

    const handleIncomingChat = (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    };

    const handleChatHistory = ({ messages }) => {
      if (Array.isArray(messages) && messages.length > 0) {
        setChatMessages((prev) => {
          const existingIds = new Set(prev.map((msg) => msg.id));
          const newEntries = messages.filter((msg) => !existingIds.has(msg.id));
          return [...prev, ...newEntries];
        });
      }
    };

    const handleIncomingReaction = (reaction) => {
      setExternalReactions((prev) => [...prev, reaction]);
    };

    const handleIncomingCaption = ({ speaker, text, timestamp }) => {
      const entry = internalAddTranscript(speaker, text, timestamp);
      showLiveCaption(entry);
      const meetingRoomId = session.parentRoomId || session.roomId;
      dbService.saveTranscript(meetingRoomId, entry).catch((err) => {
        console.warn('Remote transcript save failed:', err.message);
      });
    };

    const handleMuteAllCommand = () => {
      const currentMediaState = mediaStateRef.current;
      if (!currentMediaState.isAudioMuted) {
        currentMediaState.toggleAudio();
      }
      internalAddTranscript('Host Moderator', 'Your microphone was muted by the Host.');
    };

    const handleLockStatus = ({ isLocked }) => {
      setIsRoomLocked(isLocked);
    };

    const handleLocalMediaState = ({ isMuted, isVideoOff }) => {
      if (typeof isMuted === 'boolean') mediaStateRef.current.setAudioMuted(isMuted);
      if (typeof isVideoOff === 'boolean') mediaStateRef.current.setVideoDisabled(isVideoOff);
    };

    const handleMediaStatePersistenceError = ({ message }) => {
      alert(message || 'Your meeting media state could not be saved.');
    };

    const handleRoomControlError = ({ message }) => {
      alert(message || 'The meeting control could not be completed.');
    };

    const handleMeetingEnded = () => {
      alert('The meeting was ended by the host.');
      void finishMeeting();
    };

    const handleBreakoutAssignment = ({ roomId, parentRoomId, groupName, active }) => {
      setSession((current) => {
        if (!current) return current;
        const nextSession = { ...current, roomId };
        if (active) {
          nextSession.parentRoomId = parentRoomId;
          nextSession.groupName = groupName || 'Breakout room';
        } else {
          delete nextSession.parentRoomId;
          delete nextSession.groupName;
        }
        return nextSession;
      });
      setActiveSidebarTab('breakouts');
      setSidebarOpen(true);
    };

    const handleAgendaUpdate = ({ agenda }) => {
      if (Array.isArray(agenda)) {
        setSession((current) => current ? { ...current, agenda } : current);
      }
    };

    // Knock request for Host
    const handleKnockRequest = (requestData) => {
      if (session.isHost || currentUserRef.current?.role === 'host') {
        setKnockRequests((prev) => [...prev, requestData]);
      }
    };

    const handleJoinError = (payload) => {
      const message = payload?.message || (typeof payload === 'string' ? payload : 'Could not join this room.');
      alert(message);
      void finishMeeting();
    };

    socketService.on('room-join-error', handleJoinError);
    socketService.on('room-chat-history', handleChatHistory);
    socketService.on('receive-chat-message', handleIncomingChat);
    socketService.on('receive-reaction', handleIncomingReaction);
    socketService.on('caption-stream', handleIncomingCaption);
    socketService.on('host-mute-all-command', handleMuteAllCommand);
    socketService.on('room-lock-status', handleLockStatus);
    socketService.on('local-media-state', handleLocalMediaState);
    socketService.on('media-state-persistence-error', handleMediaStatePersistenceError);
    socketService.on('room-control-error', handleRoomControlError);
    socketService.on('meeting-ended-by-host', handleMeetingEnded);
    socketService.on('knock-request', handleKnockRequest);
    socketService.on('breakout-assignment', handleBreakoutAssignment);
    socketService.on('meeting-agenda-updated', handleAgendaUpdate);

    socketService.joinRoom(session.roomId, {
      ...currentUserRef.current,
      parentRoomId: session.parentRoomId || session.roomId,
      isMuted: mediaStateRef.current.isAudioMuted,
      isVideoOff: mediaStateRef.current.isVideoDisabled,
    }, session.roomAccessToken);

    return () => {
      socketService.off('room-join-error', handleJoinError);
      socketService.off('room-chat-history', handleChatHistory);
      socketService.off('receive-chat-message', handleIncomingChat);
      socketService.off('receive-reaction', handleIncomingReaction);
      socketService.off('caption-stream', handleIncomingCaption);
      socketService.off('host-mute-all-command', handleMuteAllCommand);
      socketService.off('room-lock-status', handleLockStatus);
      socketService.off('local-media-state', handleLocalMediaState);
      socketService.off('media-state-persistence-error', handleMediaStatePersistenceError);
      socketService.off('room-control-error', handleRoomControlError);
      socketService.off('meeting-ended-by-host', handleMeetingEnded);
      socketService.off('knock-request', handleKnockRequest);
      socketService.off('breakout-assignment', handleBreakoutAssignment);
      socketService.off('meeting-agenda-updated', handleAgendaUpdate);
    };
  }, [session?.roomId, session?.isHost, session?.role, session?.parentRoomId, internalAddTranscript, showLiveCaption, finishMeeting]);

  useEffect(() => {
    if (!session?.roomId) return;
    socketService.updateMediaState({
      isMuted: mediaState.isAudioMuted,
      isVideoOff: mediaState.isVideoDisabled,
    });
  }, [session?.roomId, mediaState.isAudioMuted, mediaState.isVideoDisabled]);

  // Host Action: Admit knocking participant
  const handleAdmitKnock = (applicantSocketId, user) => {
    socketService.admitUser(applicantSocketId, user);
    setKnockRequests((prev) => prev.filter((r) => r.applicantSocketId !== applicantSocketId));
    addTranscriptEntry('Host Moderator', `Admitted ${user?.name || 'Participant'} into the meeting.`);
  };

  // Host Action: Deny knocking participant
  const handleDenyKnock = (applicantSocketId, user) => {
    socketService.denyUser(applicantSocketId, user);
    setKnockRequests((prev) => prev.filter((r) => r.applicantSocketId !== applicantSocketId));
  };

  // Trigger Gemini AI Notes Synthesis
  const handleGenerateNotes = useCallback(async () => {
    if (transcripts.length === 0) return;
    setIsGeneratingNotes(true);
    try {
      let result;
      try {
        const meetingRoomId = session?.parentRoomId || session?.roomId;
        const serverRes = await apiService.summarizeTranscripts(meetingRoomId, transcripts);
        if (serverRes?.success && serverRes?.data) {
          result = { ...serverRes.data, generationSource: serverRes.source };
        }
      } catch (e) {
        result = {
          ...(await generateAIMeetingNotes(transcripts)),
          generationSource: 'local_heuristic',
        };
      }

      if (!result) {
        result = {
          ...(await generateAIMeetingNotes(transcripts)),
          generationSource: 'local_heuristic',
        };
      }

      setNotesData(result);

      if (session?.roomId) {
        const meetingRoomId = session.parentRoomId || session.roomId;
        await dbService.saveAINotes(meetingRoomId, result);
        try {
          await apiService.saveMeetingNotes(meetingRoomId, result);
        } catch (error) {
          console.warn('Cloud AI notes sync failed:', error.message);
        }
      }
    } catch (err) {
      console.error('Failed to generate AI notes:', err);
    } finally {
      setIsGeneratingNotes(false);
    }
  }, [transcripts, session]);

  // Keyboard Shortcuts
  useEffect(() => {
    if (!session) return;

    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        mediaState.toggleAudio();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        mediaState.toggleVideo();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleGenerateNotes();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session, mediaState, handleGenerateNotes]);

  // Toggle Sidebar Tab
  const handleToggleSidebar = (tabName) => {
    if (sidebarOpen && activeSidebarTab === tabName) {
      setSidebarOpen(false);
    } else {
      setActiveSidebarTab(tabName);
      setSidebarOpen(true);
    }
  };

  const handleLeaveRoom = finishMeeting;

  // Host Action: Mute all participants
  const handleMuteAll = () => {
    socketService.sendHostMuteAll();
    addTranscriptEntry('Host Moderator', 'All participant microphones were muted by the Host.');
  };

  // Host Action: End meeting for all
  const handleEndMeetingForAll = async () => {
    socketService.sendHostEndMeeting();
    setHostControlsOpen(false);
    await finishMeeting();
  };

  const handleSignOut = async () => {
    if (session) {
      await handleLeaveRoom();
    }
    cryptoAuthService.signOut();
    setCurrentUser(null);
    setProfileModalOpen(false);
    setIsWaitingInLobby(false);
    setPendingJoinSession(null);
    setViewMode('login');
  };

  const userMenuElement = (
    <UserMenu
      user={currentUser}
      canEditProfile={!session || !currentUser?.isGuest}
      confirmSignOut={Boolean(session && currentUser?.isGuest)}
      onOpenAuth={() => setViewMode('login')}
      onOpenProfile={() => {
        if (!session || !currentUser?.isGuest) setProfileModalOpen(true);
      }}
      onSignOut={handleSignOut}
    />
  );

  const latestTranscript = isListening && interimText ? interimText : liveCaption?.text || '';

  // 1. Render Dedicated Login Page
  if (viewMode === 'login' && !session) {
    return (
      <LoginPage
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          setViewMode('lobby');
        }}
        onContinueAsGuest={() => {
          setCurrentUser(cryptoAuthService.createGuestSession());
          setViewMode('lobby');
        }}
      />
    );
  }

  return (
    <>
      {/* User Profile Customization Modal */}
      <UserProfileModal
        isOpen={profileModalOpen && (!session || !currentUser?.isGuest)}
        user={currentUser}
        onClose={() => setProfileModalOpen(false)}
        onProfileUpdated={(u) => setCurrentUser(u)}
      />

      {/* Persistent Database Records & Meeting History Modal */}
      <MeetingHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        isAccount={Boolean(currentUser && !currentUser.isGuest)}
      />

      {/* Host Moderation & RBAC Control Modal */}
      <HostControlsModal
        isOpen={hostControlsOpen}
        onClose={() => setHostControlsOpen(false)}
        isRoomLocked={isRoomLocked}
        onToggleLockRoom={() => {
          const nextLocked = !isRoomLocked;
          setIsRoomLocked(nextLocked);
          socketService.sendHostLockRoom(nextLocked);
        }}
        onMuteAll={handleMuteAll}
        onEndMeetingForAll={handleEndMeetingForAll}
      />

      {/* Waiting Room Screen when knocking for entry */}
      {isWaitingInLobby && pendingJoinSession && (
        <WaitingRoomScreen
          roomId={pendingJoinSession.roomId}
          userName={pendingJoinSession.userName || currentUser?.name}
          onCancelKnock={() => {
            setIsWaitingInLobby(false);
            setPendingJoinSession(null);
          }}
        />
      )}

      {/* Pre-meeting lobby if not yet in meeting */}
      {!session ? (
        <DeviceSetup
          mediaState={mediaState}
          audioLevel={audioLevel}
          isSpeaking={isSpeaking}
          currentUser={currentUser}
          userMenu={userMenuElement}
          onJoinRoom={handleJoinRoom}
          onOpenHistory={() => setHistoryModalOpen(true)}
        />
      ) : (
        /* In-meeting workspace stage */
        <MeetingRoom
          session={session}
          mediaState={mediaState}
          outboundMediaStream={outboundMediaStream}
          audioLevel={audioLevel}
          isSpeaking={isSpeaking}
          onLeaveMeeting={handleLeaveRoom}
          sidebarOpen={sidebarOpen}
          activeSidebarTab={activeSidebarTab}
          onToggleSidebar={handleToggleSidebar}
          isGeneratingNotes={isGeneratingNotes}
          onOpenHistory={() => setHistoryModalOpen(true)}
          onOpenHostControls={() => setHostControlsOpen(true)}
          userMenu={userMenuElement}
          currentUser={currentUser}
          latestTranscript={latestTranscript}
          latestCaptionSpeaker={isListening && interimText ? currentUser?.name || 'You' : liveCaption?.speaker || ''}
          isListening={isListening}
          transcriptionError={transcriptionError}
          isSpeechSupported={isSpeechSupported}
          isTranscriptionEnabled={isTranscriptionEnabled}
          onToggleTranscription={() => setIsTranscriptionEnabled((enabled) => !enabled)}
          externalReactions={externalReactions}
          knockRequests={knockRequests}
          onAdmitKnock={handleAdmitKnock}
          onDenyKnock={handleDenyKnock}
          sidebarContent={
            <SidebarContainer
              currentUser={currentUser}
              roomId={session.parentRoomId || session.roomId}
              isHost={Boolean(session.isHost || session.role === 'host')}
              agenda={session.agenda || []}
              onAgendaChange={handleAgendaChange}
              onUpdateNotes={handleUpdateNotes}
              activeTab={activeSidebarTab}
              onTabChange={setActiveSidebarTab}
              onClose={() => setSidebarOpen(false)}
              transcripts={transcripts}
              interimText={interimText}
              isListening={isListening}
              transcriptionError={transcriptionError}
              onAddTranscript={addTranscriptEntry}
              onClearTranscripts={handleClearTranscripts}
              notesData={notesData}
              isGeneratingNotes={isGeneratingNotes}
              onGenerateNotes={handleGenerateNotes}
              chatMessages={chatMessages}
              onSendChatMessage={handleSendChatMessage}
            />
          }
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
