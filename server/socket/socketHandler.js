import { randomUUID } from 'node:crypto';
import { verifySocketRoomAccess } from '../middleware/roomAccessMiddleware.js';
import { Room } from '../models/Room.js';
import { BreakoutSession } from '../models/BreakoutSession.js';
import { MeetingAgenda } from '../models/MeetingAgenda.js';
import { MeetingAttendance } from '../models/MeetingAttendance.js';
import { MeetingPoll } from '../models/MeetingPoll.js';
import { MeetingQuestion } from '../models/MeetingQuestion.js';
import { ScheduledMeeting } from '../models/ScheduledMeeting.js';
import { isDbConnected } from '../config/db.js';
import {
  breakoutSessions,
  inMemoryMeetingAttendance,
  inMemoryRooms,
  roomAgendas,
  roomPolls,
  roomQuestions,
  scheduledMeetings,
} from '../store/memoryMeetingStore.js';

/**
 * Real-Time Socket.io Collaboration, WebRTC Mesh Signaling, and Waiting Room Engine
 */

export function setupSocketHandlers(io, { disconnectGracePeriodMs = 20000 } = {}) {
  // Map of active rooms: roomId -> Set of participant objects
  const rooms = new Map();
  const breakouts = new Map();
  const pendingKnocks = new Map();
  const admittedKnocks = new Map();
  const roomLocks = new Map();
  const roomChatHistory = new Map();
  const pendingDisconnects = new Map();
  const removePendingKnock = (roomId, socketId) => {
    const requests = pendingKnocks.get(roomId);
    if (requests) {
      const entry = requests.get ? requests.get(socketId) : null;
      if (entry?.timer) clearTimeout(entry.timer);
      requests.delete(socketId);
      if (requests.size === 0) pendingKnocks.delete(roomId);
    }
  };
  const readSocketPayload = (payload) => (
    payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  );
  const emitToMeeting = (parentRoomId, event, payload, excludedSocketId = null) => {
    const activeBreakout = breakouts.get(parentRoomId);
    const roomIds = [parentRoomId, ...(activeBreakout?.groups.map((group) => group.roomId) || [])];
    for (const roomId of roomIds) {
      const target = excludedSocketId
        ? io.to(roomId).except(excludedSocketId)
        : io.to(roomId);
      target.emit(event, payload);
    }
  };
  const persistParticipantState = async (roomId, participant, { allowMissing = false } = {}) => {
    const storedParticipant = {
      userId: String(participant.userId),
      name: participant.name,
      socketId: participant.socketId || null,
      joinedAt: participant.joinedAt || new Date(),
      isMuted: Boolean(participant.isMuted),
      isVideoOff: Boolean(participant.isVideoOff),
    };

    if (isDbConnected()) {
      const participantId = storedParticipant.userId;
      const result = await Room.updateOne(
        { roomId, isActive: true },
        [{
          $set: {
            participants: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ['$participants', []] },
                    as: 'participant',
                    cond: { $ne: ['$$participant.userId', { $literal: participantId }] },
                  },
                },
                [{ $literal: storedParticipant }],
              ],
            },
          },
        }],
        { updatePipeline: true }
      );
      if (result.matchedCount !== 1) {
        if (allowMissing) return false;
        throw new Error('Active room was not found while saving participant state');
      }
      return true;
    }

    const room = inMemoryRooms.get(roomId);
    if (!room || room.isActive === false) {
      if (allowMissing) return false;
      throw new Error('Active room was not found while saving participant state');
    }
    const participants = Array.isArray(room.participants) ? room.participants : [];
    room.participants = [
      ...participants.filter((item) => String(item.userId) !== storedParticipant.userId),
      storedParticipant,
    ];
    return true;
  };
  const restoreActiveBreakout = async (parentRoomId) => {
    if (breakouts.has(parentRoomId)) return breakouts.get(parentRoomId);
    const canonical = isDbConnected()
      ? await BreakoutSession.findOne({ roomId: parentRoomId, status: 'active' }).lean()
      : (breakoutSessions.get(parentRoomId) || []).find((item) => item.status === 'active');
    if (!canonical || !Array.isArray(canonical.groups) || canonical.groups.length < 2) return null;
    const endsAt = canonical.endsAt ? new Date(canonical.endsAt).getTime() : NaN;
    if (Number.isFinite(endsAt) && endsAt <= Date.now()) {
      if (isDbConnected()) {
        await BreakoutSession.updateOne(
          { roomId: parentRoomId, id: canonical.id, status: 'active' },
          { $set: { status: 'ended' } }
        );
      } else {
        canonical.status = 'ended';
      }
      return null;
    }

    const groups = canonical.groups.map((group, index) => ({
      id: group.id || `group-${index + 1}`,
      name: group.name || `Room ${index + 1}`,
      roomId: `${parentRoomId}--${canonical.id}-${group.id || index + 1}`,
      participantIds: Array.isArray(group.participantIds) ? group.participantIds.map(String) : [],
    }));
    const breakout = { id: canonical.id, groups, timer: null };
    if (Number.isFinite(endsAt)) {
      breakout.timer = setTimeout(() => closeBreakout(parentRoomId, canonical.id), endsAt - Date.now());
    }
    if (breakouts.has(parentRoomId)) {
      clearTimeout(breakout.timer);
      return breakouts.get(parentRoomId);
    }
    breakouts.set(parentRoomId, breakout);
    return breakout;
  };
  const closeBreakout = (parentRoomId, breakoutId) => {
    const breakout = breakouts.get(parentRoomId);
    if (!breakout || breakout.id !== breakoutId) return false;
    if (breakout.timer) clearTimeout(breakout.timer);

    for (const group of breakout.groups) {
      const groupParticipants = rooms.get(group.roomId);
      for (const participant of groupParticipants?.values() || []) {
        const userId = String(participant.user?.id || participant.user?._id || '');
        const participantSocket = io.sockets.sockets.get(participant.socketId);
        if (!participantSocket || !userId) continue;
        participantSocket.leave(group.roomId);
        participantSocket.join(parentRoomId);
        participantSocket.roomId = parentRoomId;
        participantSocket.parentRoomId = parentRoomId;
        participantSocket.emit('breakout-assignment', {
          breakoutId,
          roomId: parentRoomId,
          parentRoomId,
          active: false,
        });
        const parentParticipants = rooms.get(parentRoomId) || new Map();
        parentParticipants.set(participant.socketId, { ...participant, joinedAt: new Date() });
        rooms.set(parentRoomId, parentParticipants);
      }
      rooms.delete(group.roomId);
    }
    breakouts.delete(parentRoomId);
    if (isDbConnected()) {
      BreakoutSession.updateOne(
        { roomId: parentRoomId, id: breakoutId, status: 'active' },
        { $set: { status: 'ended' } }
      ).catch((error) => console.error('Persist breakout end error:', error));
    } else {
      const sessions = breakoutSessions.get(parentRoomId) || [];
      const session = sessions.find((item) => item.id === breakoutId);
      if (session) session.status = 'ended';
    }
    io.to(parentRoomId).emit('breakout-updated', { breakout: { id: breakoutId, status: 'ended' } });
    return true;
  };

  io.on('connection', (socket) => {
    console.log(`⚡ [Socket.io] Client connected: ${socket.id}`);

    // --- Waiting Room / Knocking Workflow ---
    socket.on('knock-room', async (payload) => {
      const { roomId, user, accessToken } = readSocketPayload(payload);
      const access = verifySocketRoomAccess(accessToken, roomId);
      if (!access || access.role === 'host') {
        socket.emit('room-join-error', { message: 'A valid participant room token is required to request entry' });
        return;
      }
      let room;
      try {
        room = isDbConnected()
          ? await Room.findOne({ roomId }).select('isActive').lean()
          : inMemoryRooms.get(roomId);
      } catch (error) {
        console.error('Verify waiting room status error:', error);
        socket.emit('room-join-error', { message: 'Could not verify meeting room status' });
        return;
      }
      if (!room || room.isActive === false) {
        socket.emit('room-join-error', { message: 'Meeting room is inactive or no longer exists' });
        return;
      }
      socket.user = {
        id: access.participantId,
        name: access.displayName || user?.name || 'Guest',
        role: access.role,
      };
      socket.knockingRoomId = roomId;
      removePendingKnock(roomId, socket.id);
      const roomKnocks = pendingKnocks.get(roomId) || new Map();
      const knockTimer = setTimeout(() => {
        removePendingKnock(roomId, socket.id);
        socket.emit('knock-response', {
          approved: false,
          message: 'Your admission request timed out waiting for the host.',
        });
      }, 300_000);
      knockTimer.unref();
      roomKnocks.set(socket.id, { timer: knockTimer, user: socket.user });
      pendingKnocks.set(roomId, roomKnocks);

      socket.to(roomId).emit('knock-request', {
        applicantSocketId: socket.id,
        user: socket.user,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    });

    socket.on('admit-user', async (payload) => {
      const { applicantSocketId } = readSocketPayload(payload);
      const roomId = socket.roomId;
      const requests = roomId ? pendingKnocks.get(roomId) : null;
      if (socket.user?.role !== 'host' || !rooms.get(roomId)?.has(socket.id)
        || !requests?.has(applicantSocketId)) return;
      const applicant = io.sockets.sockets.get(applicantSocketId);
      if (!applicant || applicant.knockingRoomId !== roomId || !applicant.user?.id) return;
      try {
        if (isDbConnected()) {
          await Room.updateOne(
            { roomId },
            { $addToSet: { admittedParticipantIds: applicant.user.id } }
          );
        } else {
          const room = inMemoryRooms.get(roomId);
          if (room) {
            room.admittedParticipantIds = [...new Set([
              ...(room.admittedParticipantIds || []),
              applicant.user.id,
            ])];
          }
        }
      } catch (error) {
        console.error('Persist room admission error:', error);
        socket.emit('room-control-error', { message: 'Could not admit participant' });
        return;
      }
      removePendingKnock(roomId, applicantSocketId);
      admittedKnocks.set(applicantSocketId, roomId);
      applicant.knockingRoomId = null;
      console.log(`✅ [Knock] Host admitted user "${applicant.user.name || applicantSocketId}"`);
      io.to(applicantSocketId).emit('knock-response', {
        approved: true,
        message: 'You have been admitted by the host.',
      });
    });

    socket.on('deny-user', (payload) => {
      const { applicantSocketId, user } = readSocketPayload(payload);
      const roomId = socket.roomId;
      const requests = roomId ? pendingKnocks.get(roomId) : null;
      if (socket.user?.role !== 'host' || !rooms.get(roomId)?.has(socket.id)
        || !requests?.has(applicantSocketId)) return;
      removePendingKnock(roomId, applicantSocketId);
      const applicant = io.sockets.sockets.get(applicantSocketId);
      if (applicant) applicant.knockingRoomId = null;
      console.log(`❌ [Knock] Host denied entry for "${user?.name || applicantSocketId}"`);
      io.to(applicantSocketId).emit('knock-response', {
        approved: false,
        message: 'The host denied your request to join this meeting.',
      });
    });

    // 1. Join Room
    socket.on('join-room', async (payload) => {
      const { roomId, user, accessToken } = readSocketPayload(payload);
      const parentRoomId = user?.parentRoomId || socket.parentRoomId || roomId;
      let access = verifySocketRoomAccess(accessToken, roomId);
      if (!access) {
        const parentAccess = verifySocketRoomAccess(accessToken, parentRoomId);
        let breakout;
        if (parentAccess) {
          try {
            breakout = await restoreActiveBreakout(parentRoomId);
          } catch (error) {
            console.error('Restore breakout session error:', error);
            socket.emit('room-join-error', { message: 'Could not verify breakout assignment' });
            return;
          }
        }
        const assigned = breakout?.groups.some((group) => (
          group.roomId === roomId && group.participantIds.includes(parentAccess?.participantId)
        ));
        if (parentAccess && assigned) access = parentAccess;
      }
      if (!access) {
        socket.emit('room-join-error', { message: 'A valid room access token is required to join' });
        return;
      }
      const resolvedParentRoomId = access.roomId;
      if (roomId !== resolvedParentRoomId) {
        const breakout = breakouts.get(resolvedParentRoomId);
        const assigned = breakout?.groups.some((group) => (
          group.roomId === roomId && group.participantIds.includes(access.participantId)
        ));
        if (!assigned) {
          socket.emit('room-join-error', { message: 'You are not assigned to this breakout room' });
          return;
        }
      }
      let room = null;
      if (isDbConnected()) {
        room = await Room.findOne({ roomId: resolvedParentRoomId, isActive: true })
            .select('isLocked admittedParticipantIds title hostId hostName participants')
          .lean();
      } else {
        room = inMemoryRooms.get(resolvedParentRoomId) || null;
      }
      if (!isDbConnected() && room?.isActive === false) {
        socket.emit('room-join-error', { message: 'Meeting room is inactive or no longer exists' });
        return;
      }
      if (isDbConnected() && !room) {
        socket.emit('room-join-error', { message: 'Meeting room is inactive or no longer exists' });
        return;
      }
      if (roomLocks.has(resolvedParentRoomId)) {
        room.isLocked = roomLocks.get(resolvedParentRoomId);
      } else if (room?.isLocked) {
        roomLocks.set(resolvedParentRoomId, true);
      }
      const isAdmitted = admittedKnocks.get(socket.id) === resolvedParentRoomId
        || room?.admittedParticipantIds?.includes(access.participantId);
      if (room?.isLocked && access.role !== 'host' && !isAdmitted) {
        socket.emit('room-join-error', { message: 'This room is locked; ask the host to admit you' });
        return;
      }
      const savedParticipant = room?.participants?.find(
        (participant) => String(participant.userId) === String(access.participantId)
      );
      const mediaState = {
        isMuted: savedParticipant ? Boolean(savedParticipant.isMuted) : Boolean(user?.isMuted),
        isVideoOff: savedParticipant ? Boolean(savedParticipant.isVideoOff) : Boolean(user?.isVideoOff),
      };
      if (access.accountId) {
        try {
          if (isDbConnected()) {
            const filter = { roomId: resolvedParentRoomId, userId: access.accountId };
            const update = {
              $set: {
                socketId: socket.id,
                title: room.title || 'Instant Meeting',
                hostName: room.hostName || 'Meeting Host',
                role: access.role,
                joinedAt: new Date(),
                leftAt: null,
              },
            };
            const options = { upsert: true, returnDocument: 'after', runValidators: true };
            try {
              await MeetingAttendance.findOneAndUpdate(filter, update, options);
            } catch (error) {
              // Concurrent join emits for the same user can race on the unique upsert.
              if (error?.code !== 11000) throw error;
              await MeetingAttendance.findOneAndUpdate(filter, update, options);
            }
            if (access.role === 'participant') {
              const result = await Room.updateOne(
                { roomId: resolvedParentRoomId, isActive: true },
                { $addToSet: { attendeeIds: access.accountId } }
              );
              if (result.matchedCount !== 1) {
                socket.emit('room-join-error', { message: 'Meeting room is inactive or no longer exists' });
                return;
              }
            }
          } else {
            if (access.role === 'participant' && room) {
              room.attendeeIds = [...new Set([...(room.attendeeIds || []), access.accountId])];
            }
            inMemoryMeetingAttendance.set(`${resolvedParentRoomId}:${access.accountId}`, {
              roomId: resolvedParentRoomId,
              userId: access.accountId,
              socketId: socket.id,
              title: room?.title || 'Instant Meeting',
              hostName: room?.hostName || 'Meeting Host',
              role: access.role,
              joinedAt: new Date(),
              leftAt: null,
            });
          }
        } catch (error) {
          // History persistence must never eject a user from a live meeting.
          console.error('Persist meeting attendance error:', error);
        }
      }
      admittedKnocks.delete(socket.id);
      removePendingKnock(resolvedParentRoomId, socket.id);

      // Check if rejoining within disconnect grace period
      const graceKey = `${resolvedParentRoomId}:${access.participantId}`;
      const pendingGrace = pendingDisconnects.get(graceKey);
      let isReconnecting = false;
      let oldSocketId = null;

      if (pendingGrace) {
        clearTimeout(pendingGrace.timer);
        pendingDisconnects.delete(graceKey);
        isReconnecting = true;
        oldSocketId = pendingGrace.socketId;

        // Purge old socket from room map
        if (rooms.has(pendingGrace.roomId)) {
          rooms.get(pendingGrace.roomId).delete(pendingGrace.socketId);
        }
      }

      if (socket.roomId && socket.roomId !== roomId) {
        socket.leave(socket.roomId);
        const previousParticipants = rooms.get(socket.roomId);
        previousParticipants?.delete(socket.id);
        if (previousParticipants?.size === 0) rooms.delete(socket.roomId);
      }
      socket.join(roomId);
      socket.roomId = roomId;
      socket.user = {
        id: access.participantId,
        accountId: access.accountId,
        name: access.displayName || user?.name || 'Guest',
        role: access.role,
        ...mediaState,
      };
      socket.parentRoomId = resolvedParentRoomId;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
      }
      const roomParticipants = rooms.get(roomId);
      roomParticipants.set(socket.id, {
        socketId: socket.id,
        user: socket.user,
        joinedAt: new Date(),
        isMuted: mediaState.isMuted,
        isVideoOff: mediaState.isVideoOff,
        isHandRaised: false,
      });
      const participant = roomParticipants.get(socket.id);
      try {
        await persistParticipantState(resolvedParentRoomId, {
          userId: access.participantId,
          name: socket.user.name,
          socketId: socket.id,
          joinedAt: participant.joinedAt,
          ...mediaState,
        });
      } catch (error) {
        console.error('Persist room participant state error:', error);
        socket.emit('media-state-persistence-error', {
          message: 'Your meeting media state could not be saved.',
        });
      }

      console.log(`👤 [Socket.io] User "${socket.user.name}" joined room: ${roomId} (Total: ${roomParticipants.size})`);

      // Notify existing peers about the new user or reconnected user
      if (isReconnecting && oldSocketId) {
        socket.to(roomId).emit('user-reconnected', {
          oldSocketId,
          newSocketId: socket.id,
          user: socket.user,
        });
      } else {
        socket.to(roomId).emit('user-joined', {
          socketId: socket.id,
          user: socket.user,
        });
      }

      // Send the list of existing peers in the room to the newly joined user
      const existingPeers = Array.from(roomParticipants.entries())
        .filter(([id]) => id !== socket.id)
        .map(([id, data]) => ({
          socketId: id,
          user: data.user,
          isMuted: data.isMuted,
          isVideoOff: data.isVideoOff,
          isHandRaised: data.isHandRaised,
        }));

      socket.emit('room-peers', { peers: existingPeers });
      socket.emit('local-media-state', mediaState);
      socket.emit('room-lock-status', { isLocked: Boolean(room?.isLocked) });
      const recentChat = roomChatHistory.get(resolvedParentRoomId) || [];
      if (recentChat.length > 0) {
        socket.emit('room-chat-history', { messages: recentChat });
      }
    });

    socket.on('update-media-state', async (payload) => {
      const { isMuted, isVideoOff } = readSocketPayload(payload);
      if (!socket.roomId || !rooms.has(socket.roomId)) return;
      const participant = rooms.get(socket.roomId).get(socket.id);
      if (!participant || typeof isMuted !== 'boolean' || typeof isVideoOff !== 'boolean') return;

      participant.isMuted = isMuted;
      participant.isVideoOff = isVideoOff;
      participant.user.isMuted = isMuted;
      participant.user.isVideoOff = isVideoOff;
      try {
        await persistParticipantState(socket.parentRoomId || socket.roomId, {
          userId: socket.user.id,
          name: socket.user.name,
          socketId: socket.id,
          joinedAt: participant.joinedAt,
          isMuted,
          isVideoOff,
        });
      } catch (error) {
        console.error('Persist participant media state error:', error);
        socket.emit('media-state-persistence-error', {
          message: 'Your meeting media state could not be saved.',
        });
      }
      io.to(socket.roomId).emit('participant-media-state', {
        socketId: socket.id,
        isMuted: participant.isMuted,
        isVideoOff: participant.isVideoOff,
      });
    });

    // 2. WebRTC Signaling: Offer
    socket.on('webrtc-offer', (payload) => {
      const { targetSocketId, offer } = readSocketPayload(payload);
      const room = socket.roomId ? rooms.get(socket.roomId) : null;
      if (!room?.has(socket.id) || !room.has(targetSocketId)) return;
      socket.to(targetSocketId).emit('webrtc-offer', {
        senderSocketId: socket.id,
        user: socket.user,
        offer,
      });
    });

    // 3. WebRTC Signaling: Answer
    socket.on('webrtc-answer', (payload) => {
      const { targetSocketId, answer } = readSocketPayload(payload);
      const room = socket.roomId ? rooms.get(socket.roomId) : null;
      if (!room?.has(socket.id) || !room.has(targetSocketId)) return;
      socket.to(targetSocketId).emit('webrtc-answer', {
        senderSocketId: socket.id,
        answer,
      });
    });

    // 4. WebRTC Signaling: ICE Candidate
    socket.on('webrtc-ice-candidate', (payload) => {
      const { targetSocketId, candidate } = readSocketPayload(payload);
      const room = socket.roomId ? rooms.get(socket.roomId) : null;
      if (!room?.has(socket.id) || !room.has(targetSocketId)) return;
      socket.to(targetSocketId).emit('webrtc-ice-candidate', {
        senderSocketId: socket.id,
        candidate,
      });
    });

    socket.on('ice-restart-request', (payload) => {
      const { targetSocketId } = readSocketPayload(payload);
      const room = socket.roomId ? rooms.get(socket.roomId) : null;
      if (room?.has(socket.id) && room.has(targetSocketId)) {
        socket.to(targetSocketId).emit('ice-restart-request', {
          senderSocketId: socket.id,
        });
      }
    });

    // 5. In-Room Chat Message Broadcast
    socket.on('send-chat-message', (messageData) => {
      if (!socket.roomId || !rooms.get(socket.roomId)?.has(socket.id)) return;
      const text = typeof messageData?.text === 'string' ? messageData.text.trim() : '';
      if (!text || text.length > 2_000) return;
      const parentRoomId = socket.parentRoomId || socket.roomId;
      const message = {
        id: typeof messageData?.id === 'string' && messageData.id.trim() ? messageData.id.trim() : `chat-${randomUUID()}`,
        senderId: socket.user.id,
        senderSocketId: socket.id,
        senderName: socket.user.name,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const history = roomChatHistory.get(parentRoomId) || [];
      history.push(message);
      if (history.length > 100) history.shift();
      roomChatHistory.set(parentRoomId, history);

      socket.to(socket.roomId).emit('receive-chat-message', message);
    });

    // 6. Floating Emoji Reaction Broadcast
    socket.on('send-reaction', (reactionData) => {
      if (!socket.roomId || !rooms.get(socket.roomId)?.has(socket.id)) return;
      if (typeof reactionData?.emoji !== 'string' || reactionData.emoji.length > 16) return;
      socket.to(socket.roomId).emit('receive-reaction', {
        id: `react-${randomUUID()}`,
        emoji: reactionData.emoji,
        sender: socket.user.name,
        x: Number.isFinite(reactionData.x) ? Math.max(0, Math.min(100, reactionData.x)) : 50,
        duration: Number.isFinite(Number(reactionData.duration))
          ? Math.max(2, Math.min(3, Number(reactionData.duration)))
          : 2.5,
      });
    });

    // 7. Collaborative Whiteboard Stroke Sync
    socket.on('whiteboard-draw', (strokeData) => {
      if (!socket.roomId || !rooms.get(socket.roomId)?.has(socket.id)) return;
      const values = ['x0', 'y0', 'x1', 'y1'].map((key) => strokeData?.[key]);
      if (!values.every((value) => Number.isFinite(value) && value >= 0 && value <= 10_000)
        || typeof strokeData.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(strokeData.color)
        || !Number.isFinite(strokeData.brushSize) || strokeData.brushSize < 1 || strokeData.brushSize > 30
        || !['pen', 'eraser'].includes(strokeData.mode)) return;
      socket.to(socket.roomId).emit('whiteboard-draw', {
        x0: values[0],
        y0: values[1],
        x1: values[2],
        y1: values[3],
        color: strokeData.color,
        brushSize: strokeData.brushSize,
        mode: strokeData.mode,
      });
    });

    socket.on('whiteboard-clear', () => {
      if (socket.roomId && rooms.get(socket.roomId)?.has(socket.id)) socket.to(socket.roomId).emit('whiteboard-clear');
    });

    // 8. Live Closed Captions Stream Broadcast
    socket.on('caption-stream', (captionData) => {
      if (!socket.roomId || !rooms.get(socket.roomId)?.has(socket.id)
        || typeof captionData?.text !== 'string' || !captionData.text.trim()
        || captionData.text.length > 1_000) return;
      socket.to(socket.roomId).emit('caption-stream', {
        speaker: socket.user.name,
        text: captionData.text.trim(),
        timestamp: typeof captionData.timestamp === 'string' ? captionData.timestamp.slice(0, 100) : '',
      });
    });

    socket.on('meeting-poll-updated', async (poll) => {
      const parentRoomId = socket.parentRoomId;
      if (!parentRoomId || !rooms.get(socket.roomId)?.has(socket.id)) return;
      const pollId = typeof poll?.id === 'string' && poll.id.length <= 120 ? poll.id : '';
      if (!pollId) return;
      try {
        const canonical = isDbConnected()
          ? await MeetingPoll.findOne({ id: pollId, roomId: parentRoomId }).lean()
          : (roomPolls.get(parentRoomId) || []).find((item) => item.id === pollId);
        if (canonical) emitToMeeting(parentRoomId, 'meeting-poll-updated', { poll: canonical });
      } catch (error) {
        console.error('Load meeting poll for broadcast error:', error);
      }
    });

    socket.on('meeting-question-updated', async (question) => {
      const parentRoomId = socket.parentRoomId;
      if (!parentRoomId || !rooms.get(socket.roomId)?.has(socket.id)) return;
      const questionId = typeof question?.id === 'string' && question.id.length <= 120
        ? question.id
        : '';
      if (!questionId) return;
      try {
        const canonical = isDbConnected()
          ? await MeetingQuestion.findOne({ id: questionId, roomId: parentRoomId }).lean()
          : (roomQuestions.get(parentRoomId) || []).find((item) => item.id === questionId);
        if (canonical) emitToMeeting(parentRoomId, 'meeting-question-updated', { question: canonical });
      } catch (error) {
        console.error('Load meeting question for broadcast error:', error);
      }
    });

    socket.on('meeting-question-deleted', (payload) => {
      const parentRoomId = socket.parentRoomId;
      if (!parentRoomId || !rooms.get(socket.roomId)?.has(socket.id)) return;
      const { questionId } = readSocketPayload(payload);
      if (typeof questionId === 'string' && questionId.trim()) {
        emitToMeeting(parentRoomId, 'meeting-question-deleted', { questionId: questionId.trim() });
      }
    });

    socket.on('meeting-poll-deleted', (payload) => {
      const parentRoomId = socket.parentRoomId;
      if (!parentRoomId || !rooms.get(socket.roomId)?.has(socket.id)) return;
      const { pollId } = readSocketPayload(payload);
      if (typeof pollId === 'string' && pollId.trim()) {
        emitToMeeting(parentRoomId, 'meeting-poll-deleted', { pollId: pollId.trim() });
      }
    });

    socket.on('meeting-agenda-updated', async () => {
      const parentRoomId = socket.parentRoomId;
      if (!parentRoomId || !rooms.get(socket.roomId)?.has(socket.id)) return;
      try {
        let agenda;
        if (isDbConnected()) {
          const saved = await MeetingAgenda.findOne({ roomId: parentRoomId }).select('agenda').lean();
          agenda = saved?.agenda;
        } else {
          agenda = roomAgendas.get(parentRoomId);
        }
        if (Array.isArray(agenda)) emitToMeeting(parentRoomId, 'meeting-agenda-updated', { agenda });
      } catch (error) {
        console.error('Load meeting agenda for broadcast error:', error);
      }
    });

    socket.on('start-breakout', async (payload) => {
      let { breakout } = readSocketPayload(payload);
      const parentRoomId = socket.parentRoomId || socket.roomId;
      const roomParticipants = rooms.get(parentRoomId);
      if (socket.user?.role !== 'host' || socket.roomId !== parentRoomId || !breakout?.id
        || !roomParticipants || breakouts.has(parentRoomId)) return;
      try {
        const canonical = isDbConnected()
          ? await BreakoutSession.findOne({
            roomId: parentRoomId,
            id: breakout.id,
            status: 'active',
          }).lean()
          : (breakoutSessions.get(parentRoomId) || []).find((item) => (
            item.id === breakout.id && item.status === 'active'
          ));
        if (!canonical || !Array.isArray(canonical.groups) || canonical.groups.length < 2) return;
        breakout = canonical;
      } catch (error) {
        console.error('Load breakout session for start error:', error);
        return;
      }

      const stableUserId = (user) => String(user?.id || user?._id || '');
      const groupAssignments = breakout.groups.map((group, index) => ({
        id: group.id || `group-${index + 1}`,
        name: group.name || `Room ${index + 1}`,
        roomId: `${parentRoomId}--${breakout.id}-${group.id || index + 1}`,
        participantIds: Array.isArray(group.participantIds) ? group.participantIds.map(String) : [],
      }));
      const assignedIds = new Set(groupAssignments.flatMap((group) => group.participantIds));
      const parentHostId = stableUserId(socket.user);

      for (const [participantSocketId, participant] of roomParticipants.entries()) {
        const userId = stableUserId(participant.user);
        const group = groupAssignments.find((candidate) => candidate.participantIds.includes(userId));
        if (!userId || !assignedIds.has(userId) || userId === parentHostId || !group) continue;
        const participantSocket = io.sockets.sockets.get(participantSocketId);
        if (!participantSocket) continue;
        participantSocket.leave(parentRoomId);
        participantSocket.join(group.roomId);
        participantSocket.roomId = group.roomId;
        participantSocket.parentRoomId = parentRoomId;
        participantSocket.emit('breakout-assignment', {
          breakoutId: breakout.id,
          roomId: group.roomId,
          parentRoomId,
          groupName: group.name,
          active: true,
        });
        const breakoutParticipants = rooms.get(group.roomId) || new Map();
        breakoutParticipants.set(participantSocketId, {
          ...participant,
          joinedAt: new Date(),
        });
        rooms.set(group.roomId, breakoutParticipants);
        socket.to(parentRoomId).emit('user-left', {
          socketId: participantSocketId,
          user: participant.user,
        });
        roomParticipants.delete(participantSocketId);
      }

      const breakoutState = { id: breakout.id, groups: groupAssignments, timer: null };
      const endsAt = breakout.endsAt ? new Date(breakout.endsAt).getTime() : NaN;
      if (Number.isFinite(endsAt) && endsAt > Date.now()) {
        breakoutState.timer = setTimeout(() => closeBreakout(parentRoomId, breakout.id), endsAt - Date.now());
      }
      breakouts.set(parentRoomId, breakoutState);
      io.to(parentRoomId).emit('breakout-updated', { breakout: { ...breakout, status: 'active' } });
    });

    socket.on('end-breakout', (payload) => {
      const { breakoutId } = readSocketPayload(payload);
      const parentRoomId = socket.parentRoomId || socket.roomId;
      const breakout = breakouts.get(parentRoomId);
      if (socket.user?.role !== 'host' || socket.roomId !== parentRoomId || !breakout
        || breakout.id !== breakoutId) return;
      closeBreakout(parentRoomId, breakoutId);
    });

    socket.on('return-from-breakout', () => {
      const parentRoomId = socket.parentRoomId;
      const activeBreakout = breakouts.get(parentRoomId);
      if (!parentRoomId || !activeBreakout || socket.roomId === parentRoomId) return;
      const breakoutRoomId = socket.roomId;
      const breakoutParticipants = rooms.get(breakoutRoomId);
      breakoutParticipants?.delete(socket.id);
      if (breakoutParticipants?.size === 0) rooms.delete(breakoutRoomId);
      socket.leave(breakoutRoomId);
      socket.join(parentRoomId);
      socket.roomId = parentRoomId;
      socket.emit('breakout-assignment', {
        breakoutId: activeBreakout.id,
        roomId: parentRoomId,
        parentRoomId,
        active: false,
      });
      const parentParticipants = rooms.get(parentRoomId) || new Map();
      parentParticipants.set(socket.id, {
        socketId: socket.id,
        user: socket.user,
        joinedAt: new Date(),
        isMuted: false,
        isVideoOff: false,
        isHandRaised: false,
      });
      rooms.set(parentRoomId, parentParticipants);
    });

    // 9. Raise Hand Status Sync
    socket.on('toggle-hand-raise', (payload) => {
      const { isHandRaised } = readSocketPayload(payload);
      const participant = socket.roomId ? rooms.get(socket.roomId)?.get(socket.id) : null;
      if (!participant || typeof isHandRaised !== 'boolean') return;
      participant.isHandRaised = isHandRaised;
      io.to(socket.roomId).emit('user-hand-updated', {
        socketId: socket.id,
        user: socket.user,
        isHandRaised,
      });
    });

    // 10. Host Controls Moderation Events
    socket.on('host-mute-all', async () => {
      if (socket.user?.role === 'host' && socket.roomId
        && rooms.get(socket.roomId)?.has(socket.id)) {
        const parentRoomId = socket.parentRoomId || socket.roomId;
        const activeBreakout = breakouts.get(parentRoomId);
        const roomIds = [parentRoomId, ...(activeBreakout?.groups.map((group) => group.roomId) || [])];
        const persistenceResults = [];
        for (const roomId of roomIds) {
          for (const participant of rooms.get(roomId)?.values() || []) {
            if (participant.user?.role === 'host') continue;
            participant.isMuted = true;
            participant.user.isMuted = true;
            persistenceResults.push(persistParticipantState(parentRoomId, {
              userId: participant.user.id,
              name: participant.user.name,
              socketId: participant.socketId,
              joinedAt: participant.joinedAt,
              isMuted: true,
              isVideoOff: participant.isVideoOff,
            }));
          }
        }
        const results = await Promise.allSettled(persistenceResults);
        const failedWrites = results.filter((result) => result.status === 'rejected');
        if (failedWrites.length) {
          console.error('Persist host mute-all state error:', failedWrites.map((result) => result.reason));
          socket.emit('media-state-persistence-error', {
            message: 'Some participant mute states could not be saved.',
          });
        }
        emitToMeeting(parentRoomId, 'host-mute-all-command', undefined, socket.id);
      }
    });

    socket.on('host-lock-room', async (payload) => {
      const { isLocked } = readSocketPayload(payload);
      if (socket.user?.role === 'host' && socket.roomId
        && rooms.get(socket.roomId)?.has(socket.id)) {
        const roomId = socket.parentRoomId || socket.roomId;
        const nextLockState = Boolean(isLocked);
        if (isDbConnected()) {
          try {
            await Room.updateOne({ roomId }, { $set: { isLocked: nextLockState } });
          } catch (error) {
            console.error('Persist room lock state error:', error);
            socket.emit('room-control-error', { message: 'Could not update room lock state' });
            return;
          }
        }
        roomLocks.set(roomId, nextLockState);
        const room = inMemoryRooms.get(roomId);
        if (room) room.isLocked = nextLockState;
        emitToMeeting(roomId, 'room-lock-status', { isLocked: nextLockState }, socket.id);
      }
    });

    socket.on('host-end-meeting', async () => {
      if (socket.user?.role === 'host' && socket.roomId
        && rooms.get(socket.roomId)?.has(socket.id)) {
        const parentRoomId = socket.parentRoomId || socket.roomId;
        const endedAt = new Date();
        if (isDbConnected()) {
          try {
            await Promise.all([
              Room.updateOne({ roomId: parentRoomId }, { $set: { isActive: false, endedAt } }),
              MeetingAttendance.updateMany(
                { roomId: parentRoomId, leftAt: null },
                { $set: { leftAt: endedAt } }
              ),
              ScheduledMeeting.updateOne(
                { roomId: parentRoomId, status: 'scheduled' },
                { $set: { status: 'ended' } }
              ),
            ]);
          } catch (error) {
            console.error('Persist meeting end error:', error);
            socket.emit('room-control-error', { message: 'Could not end meeting' });
            return;
          }
        }
        const breakout = breakouts.get(parentRoomId);
        if (breakout) closeBreakout(parentRoomId, breakout.id);
        emitToMeeting(parentRoomId, 'meeting-ended-by-host', undefined, socket.id);
        for (const participantSocketId of rooms.get(parentRoomId)?.keys() || []) {
          io.sockets.sockets.get(participantSocketId)?.leave(parentRoomId);
        }
        rooms.delete(parentRoomId);
        const room = inMemoryRooms.get(parentRoomId);
        if (room) {
          room.isActive = false;
          room.endedAt = endedAt;
        }
        for (const attendance of inMemoryMeetingAttendance.values()) {
          if (attendance.roomId === parentRoomId && !attendance.leftAt) attendance.leftAt = endedAt;
        }
        const meeting = scheduledMeetings.get(parentRoomId);
        if (meeting?.status === 'scheduled') meeting.status = 'ended';
        roomLocks.delete(parentRoomId);
        roomChatHistory.delete(parentRoomId);
        for (const [applicantSocketId, admittedRoomId] of admittedKnocks) {
          if (admittedRoomId === parentRoomId) admittedKnocks.delete(applicantSocketId);
        }
        pendingKnocks.delete(parentRoomId);
      }
    });

    // Intentional leave handling
    socket.on('leave-room', async () => {
      socket.isIntentionalLeave = true;
      const accountId = socket.user?.accountId;
      const parentRoomId = socket.parentRoomId || socket.roomId;
      const graceKey = `${parentRoomId}:${socket.user?.id || socket.id}`;
      const existingGrace = pendingDisconnects.get(graceKey);
      if (existingGrace?.timer) clearTimeout(existingGrace.timer);
      pendingDisconnects.delete(graceKey);

      if (socket.roomId && rooms.has(socket.roomId)) {
        const roomMap = rooms.get(socket.roomId);
        roomMap.delete(socket.id);
        if (roomMap.size === 0) {
          rooms.delete(socket.roomId);
        } else {
          socket.to(socket.roomId).emit('user-left', {
            socketId: socket.id,
            user: socket.user,
          });
        }
      }
      if (accountId && parentRoomId) {
        const leftAt = new Date();
        try {
          if (isDbConnected()) {
            await MeetingAttendance.updateOne(
              { roomId: parentRoomId, userId: accountId },
              { $set: { leftAt } }
            );
          } else {
            const attendance = inMemoryMeetingAttendance.get(`${parentRoomId}:${accountId}`);
            if (attendance) attendance.leftAt = leftAt;
          }
        } catch (error) {
          console.error('Persist meeting attendance leave error:', error);
        }
      }
    });

    // Disconnect handling (with grace period for unannounced drops and reloads)
    socket.on('disconnect', async () => {
      console.log(`🔌 [Socket.io] Client disconnected: ${socket.id}`);
      if (socket.isIntentionalLeave) return;

      const accountId = socket.user?.accountId;
      const parentRoomId = socket.parentRoomId || socket.roomId;

      // Check whether room is active
      let isRoomActive = true;
      if (parentRoomId) {
        if (isDbConnected()) {
          try {
            const roomDoc = await Room.findOne({ roomId: parentRoomId }).lean();
            if (roomDoc && (roomDoc.isActive === false || roomDoc.endedAt)) {
              isRoomActive = false;
            }
          } catch {
            // Room check fallback
          }
        } else {
          const memRoom = inMemoryRooms.get(parentRoomId);
          if (memRoom && (memRoom.isActive === false || memRoom.endedAt)) {
            isRoomActive = false;
          }
        }
      }

      const activeParticipant = socket.roomId ? rooms.get(socket.roomId)?.get(socket.id) : null;
      if (activeParticipant && socket.user?.id && parentRoomId && isRoomActive) {
        try {
          await persistParticipantState(parentRoomId, {
            userId: socket.user.id,
            name: socket.user.name,
            socketId: null,
            joinedAt: activeParticipant.joinedAt,
            isMuted: activeParticipant.isMuted,
            isVideoOff: activeParticipant.isVideoOff,
            isDisconnected: true,
          }, { allowMissing: true });
        } catch (error) {
          console.error('Persist disconnected participant state error:', error);
        }
      }

      if (socket.roomId && rooms.has(socket.roomId)) {
        const roomMap = rooms.get(socket.roomId);
        const participant = roomMap.get(socket.id);
        if (participant) {
          if (!isRoomActive || disconnectGracePeriodMs <= 0) {
            roomMap.delete(socket.id);
            if (roomMap.size === 0) {
              rooms.delete(socket.roomId);
            } else {
              socket.to(socket.roomId).emit('user-left', {
                socketId: socket.id,
                user: socket.user,
              });
            }
            if (accountId && parentRoomId) {
              const leftAt = new Date();
              try {
                if (isDbConnected()) {
                  await MeetingAttendance.updateOne(
                    { roomId: parentRoomId, userId: accountId },
                    { $set: { leftAt } }
                  );
                } else {
                  const attendance = inMemoryMeetingAttendance.get(`${parentRoomId}:${accountId}`);
                  if (attendance && !attendance.leftAt) attendance.leftAt = leftAt;
                }
              } catch (error) {
                console.error('Persist meeting attendance end error:', error);
              }
            }
            return;
          }

          participant.isDisconnected = true;
          participant.disconnectedAt = new Date();

          // Inform peers that participant is temporarily disconnected
          socket.to(socket.roomId).emit('user-disconnected', {
            socketId: socket.id,
            user: socket.user,
          });

          const graceKey = `${parentRoomId}:${socket.user?.id || socket.id}`;
          const existingGrace = pendingDisconnects.get(graceKey);
          if (existingGrace?.timer) clearTimeout(existingGrace.timer);

          const capturedSocketId = socket.id;
          const capturedRoomId = socket.roomId;
          const capturedUser = socket.user;

          const timer = setTimeout(async () => {
            pendingDisconnects.delete(graceKey);
            if (rooms.has(capturedRoomId)) {
              const currentRoomMap = rooms.get(capturedRoomId);
              if (currentRoomMap.has(capturedSocketId)) {
                currentRoomMap.delete(capturedSocketId);
                if (currentRoomMap.size === 0) {
                  rooms.delete(capturedRoomId);
                } else {
                  io.to(capturedRoomId).emit('user-left', {
                    socketId: capturedSocketId,
                    user: capturedUser,
                  });
                }
              }
            }
            if (accountId && parentRoomId) {
              const leftAt = new Date();
              try {
                if (isDbConnected()) {
                  await MeetingAttendance.updateOne(
                    { roomId: parentRoomId, userId: accountId },
                    { $set: { leftAt } }
                  );
                } else {
                  const attendance = inMemoryMeetingAttendance.get(`${parentRoomId}:${accountId}`);
                  if (attendance) attendance.leftAt = leftAt;
                }
              } catch (error) {
                console.error('Persist meeting attendance end error:', error);
              }
            }
          }, disconnectGracePeriodMs);
          timer.unref();

          pendingDisconnects.set(graceKey, {
            timer,
            socketId: socket.id,
            roomId: socket.roomId,
            parentRoomId,
            user: socket.user,
            accountId,
          });
        }
      }

      if (socket.knockingRoomId) {
        removePendingKnock(socket.knockingRoomId, socket.id);
      }
      admittedKnocks.delete(socket.id);
    });
  });
}
