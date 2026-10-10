import { io } from 'socket.io-client';
import { getApiBaseUrl } from './apiBaseUrl';

class SocketService {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.roomUser = null;
    this.roomAccessToken = null;
    this.joinedSocketId = null;
  }

  connect() {
    if (this.socket) {
      if (!this.socket.connected && !this.socket.active) this.socket.connect();
      return this.socket;
    }

    const socketUrl = getApiBaseUrl() || window.location.origin;
    
    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('⚡ [Socket] Connected with ID:', this.socket.id);
      this.joinedSocketId = null;
      this.emitJoinRoom();
    });

    this.socket.on('disconnect', () => {
      this.joinedSocketId = null;
    });

    this.socket.on('connect_error', (err) => {
      console.warn('⚠️ [Socket] Connection error:', err.message);
    });

    return this.socket;
  }

  // --- Waiting Room / Knocking ---
  knockRoom(roomId, user, accessToken) {
    if (!this.socket) this.connect();
    this.socket.emit('knock-room', { roomId, user, accessToken });
  }

  admitUser(applicantSocketId, user) {
    this.socket?.emit('admit-user', { applicantSocketId, user });
  }

  denyUser(applicantSocketId, user) {
    this.socket?.emit('deny-user', { applicantSocketId, user });
  }

  joinRoom(roomId, user, roomAccessToken) {
    const membershipChanged = this.roomId !== roomId
      || this.roomAccessToken !== roomAccessToken
      || this.roomUser?.id !== user?.id
      || this.roomUser?.name !== user?.name
      || this.roomUser?.parentRoomId !== user?.parentRoomId;
    this.roomId = roomId;
    this.roomUser = user;
    this.roomAccessToken = roomAccessToken;
    if (membershipChanged) this.joinedSocketId = null;
    this.connect();
    this.emitJoinRoom();
  }

  updateMediaState(mediaState) {
    this.socket?.emit('update-media-state', mediaState);
  }

  sendScreenShareState(isScreenSharing) {
    if (typeof isScreenSharing !== 'boolean') return;
    if (this.roomUser) this.roomUser = { ...this.roomUser, isScreenSharing };
    this.socket?.emit('screen-share-state', { isScreenSharing });
  }

  resendScreenShareState() {
    const isScreenSharing = this.roomUser?.isScreenSharing;
    if (typeof isScreenSharing === 'boolean') {
      this.socket?.emit('screen-share-state', { isScreenSharing });
    }
  }

  emitJoinRoom() {
    if (!this.socket?.connected || !this.roomId || !this.roomUser) return;
    if (this.joinedSocketId === this.socket.id) return;
    this.socket.emit('join-room', {
      roomId: this.roomId,
      user: this.roomUser,
      accessToken: this.roomAccessToken,
    });
    this.joinedSocketId = this.socket.id;
  }

  leaveRoom() {
    if (this.socket) {
      if (this.socket.connected) {
        this.socket.emit('leave-room');
      }
      this.socket.disconnect();
      this.socket = null;
      this.roomId = null;
      this.roomUser = null;
      this.roomAccessToken = null;
      this.joinedSocketId = null;
    }
  }

  // WebRTC Signaling
  sendOffer(targetSocketId, offer) {
    this.socket?.emit('webrtc-offer', { targetSocketId, offer });
  }

  sendAnswer(targetSocketId, answer) {
    this.socket?.emit('webrtc-answer', { targetSocketId, answer });
  }

  sendIceCandidate(targetSocketId, candidate) {
    this.socket?.emit('webrtc-ice-candidate', { targetSocketId, candidate });
  }

  getSocketId() {
    return this.socket?.id || null;
  }

  requestIceRestart(targetSocketId) {
    this.socket?.emit('ice-restart-request', { targetSocketId });
  }

  // Chat
  sendChatMessage(message) {
    this.socket?.emit('send-chat-message', message);
  }

  // Reactions
  sendReaction(reaction) {
    this.socket?.emit('send-reaction', reaction);
  }

  // Whiteboard
  sendWhiteboardDraw(stroke) {
    this.socket?.emit('whiteboard-draw', stroke);
  }

  sendWhiteboardClear() {
    this.socket?.emit('whiteboard-clear');
  }

  // Closed Captions
  sendCaptionStream(captionData) {
    this.socket?.emit('caption-stream', captionData);
  }

  // Hand Raise
  toggleHandRaise(isHandRaised) {
    this.socket?.emit('toggle-hand-raise', { isHandRaised });
  }

  // Host Controls
  sendHostMuteAll() {
    this.socket?.emit('host-mute-all');
  }

  sendHostLockRoom(isLocked) {
    this.socket?.emit('host-lock-room', { isLocked });
  }

  sendHostEndMeeting() {
    this.socket?.emit('host-end-meeting');
  }

  broadcastPollUpdate(poll) {
    this.socket?.emit('meeting-poll-updated', poll);
  }

  broadcastQuestionUpdate(question) {
    this.socket?.emit('meeting-question-updated', question);
  }

  updateMeetingAgenda(agenda) {
    this.socket?.emit('meeting-agenda-updated', { agenda });
  }

  startBreakout(breakout) {
    this.socket?.emit('start-breakout', { breakout });
  }

  endBreakout(breakoutId) {
    this.socket?.emit('end-breakout', { breakoutId });
  }

  returnFromBreakout() {
    this.socket?.emit('return-from-breakout');
  }

  // Generic Event Listener Subscriptions
  on(event, callback) {
    if (!this.socket) this.connect();
    this.socket.on(event, callback);
  }

  off(event, callback) {
    this.socket?.off(event, callback);
  }
}

export const socketService = new SocketService();
