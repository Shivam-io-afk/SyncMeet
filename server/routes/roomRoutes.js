import { randomUUID } from 'node:crypto';
import express from 'express';
import { Room } from '../models/Room.js';
import { isDbConnected } from '../config/db.js';
import { optionalProtect, protect } from '../middleware/authMiddleware.js';
import {
  issueRoomAccessToken,
  issueRoomCredentials,
  requireRoomAccess,
  verifyRoomRefreshToken,
} from '../middleware/roomAccessMiddleware.js';
import { ScheduledMeeting } from '../models/ScheduledMeeting.js';
import { BreakoutSession } from '../models/BreakoutSession.js';
import { inMemoryRooms, scheduledMeetings, breakoutSessions } from '../store/memoryMeetingStore.js';

const router = express.Router();

// @route   POST /api/rooms/create
// @desc    Create a new meeting room (Authenticated hosts only)
// @access  Private
router.post('/create', protect, async (req, res) => {
  const { roomId, title, settings, isLocked } = req.body;
  if (isLocked !== undefined && typeof isLocked !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Room lock state must be a boolean' });
  }
  if (roomId !== undefined && (
    typeof roomId !== 'string'
    || !roomId.trim()
    || roomId.trim().length > 120
  )) {
    return res.status(400).json({ success: false, message: 'Provide a valid room ID' });
  }
  const finalRoomId = typeof roomId === 'string' ? roomId.trim() : `room-${randomUUID()}`;

  const hostUser = req.user;

  const roomData = {
    roomId: finalRoomId,
    title: title || 'Instant Meeting',
    hostId: hostUser.id || hostUser._id,
    hostName: hostUser.name || 'Meeting Host',
    isLocked: isLocked ?? true,
    settings: {
      allowScreenShare: true,
      allowAINotes: true,
      allowChat: true,
      allowWhiteboard: true,
      ...settings,
    },
    attendeeIds: [],
    participants: [],
    isActive: true,
    createdAt: new Date(),
  };

  try {
    if (isDbConnected()) {
      const room = await Room.create(roomData);
      const credentials = issueRoomCredentials({
        roomId: finalRoomId,
        participantId: String(hostUser.id || hostUser._id),
        role: 'host',
        displayName: hostUser.name || 'Meeting Host',
        accountId: String(hostUser.id || hostUser._id),
      });
      return res.status(201).json({ success: true, room, ...credentials });
    }
    // In-memory fallback
    // In-memory fallback
    if (inMemoryRooms.has(finalRoomId)) {
      return res.status(409).json({ success: false, message: 'That room ID is already in use' });
    }
    inMemoryRooms.set(finalRoomId, roomData);
    const credentials = issueRoomCredentials({
      roomId: finalRoomId,
      participantId: String(hostUser.id || hostUser._id),
      role: 'host',
      displayName: hostUser.name || 'Meeting Host',
      accountId: String(hostUser.id || hostUser._id),
    });
    return res.status(201).json({ success: true, room: roomData, ...credentials });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'That room ID is already in use' });
    }
    console.error('Create room error:', error);
    return res.status(500).json({ success: false, message: 'Server error creating room' });
  }
});

router.post('/guest', optionalProtect, async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : 'Instant Meeting';
  const hostName = typeof req.body?.hostName === 'string' ? req.body.hostName.trim() : 'Meeting Host';
  const isLocked = req.body?.isLocked;
  if (isLocked !== undefined && typeof isLocked !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Room lock state must be a boolean' });
  }
  if (!title || title.length > 150 || !hostName || hostName.length > 120) {
    return res.status(400).json({ success: false, message: 'Provide a valid meeting title and host name' });
  }

  const roomId = `room-${randomUUID()}`;
  const hostId = req.user ? String(req.user.id || req.user._id) : `guest-${randomUUID()}`;
  const roomData = {
    roomId,
    title,
    hostId,
    hostName,
    isLocked: isLocked ?? true,
    settings: { allowScreenShare: true, allowAINotes: true, allowChat: true, allowWhiteboard: true },
    attendeeIds: [],
    participants: [],
    isActive: true,
    createdAt: new Date(),
  };

  try {
    const resolvedHostName = req.user?.name || hostName;
    roomData.hostName = resolvedHostName;
    const room = isDbConnected() ? await Room.create(roomData) : (inMemoryRooms.set(roomId, roomData), roomData);
    const credentials = issueRoomCredentials({
      roomId,
      participantId: hostId,
      role: 'host',
      displayName: resolvedHostName,
      ...(req.user ? { accountId: hostId } : {}),
    });
    return res.status(201).json({ success: true, room, ...credentials });
  } catch (error) {
    console.error('Create guest room error:', error);
    return res.status(500).json({ success: false, message: 'Could not create meeting room' });
  }
});

router.post('/:roomId/join', optionalProtect, async (req, res) => {
  const { roomId } = req.params;
  const name = typeof req.body?.name === 'string' && req.body.name.trim()
    ? req.body.name.trim()
    : (req.user?.name || '');
  if (!roomId || roomId.length > 120 || !name || name.length > 120) {
    return res.status(400).json({ success: false, message: 'Provide a valid room ID and participant name' });
  }
  try {
    let room = isDbConnected()
      ? await Room.findOne({ roomId, isActive: true }).select('roomId isLocked title hostId hostName createdAt').lean()
      : inMemoryRooms.get(roomId);
    if (room?.isActive === false) room = null;
    const scheduledMeeting = room ? null : (isDbConnected()
      ? await ScheduledMeeting.findOne({ roomId, status: 'scheduled' }).select('roomId invitees').lean()
      : (scheduledMeetings.get(roomId)?.status === 'scheduled' ? scheduledMeetings.get(roomId) : null));
    if (!room && !scheduledMeeting) {
      return res.status(404).json({ success: false, message: 'Meeting room not found or no longer active' });
    }
    const isHost = Boolean(req.user && room?.hostId && String(req.user.id || req.user._id) === String(room.hostId));
    const userId = req.user ? String(req.user.id || req.user._id) : null;
    const participantId = userId || `guest-${randomUUID()}`;
    const role = isHost ? 'host' : 'participant';
    const credentials = issueRoomCredentials({
      roomId,
      participantId,
      role,
      displayName: isHost ? room.hostName : name,
      ...(req.user ? { accountId: String(req.user.id || req.user._id) } : {}),
    });
    return res.json({
      success: true,
      participant: { id: participantId, name: isHost ? room.hostName : name },
      ...credentials,
      role,
      createdAt: room?.createdAt || null,
      requiresAdmission: Boolean(room?.isLocked || scheduledMeeting?.invitees?.length),
    });
  } catch (error) {
    console.error('Join room error:', error);
    return res.status(500).json({ success: false, message: 'Could not join meeting room' });
  }
});

router.post('/:roomId/refresh', async (req, res) => {
  const { roomId } = req.params;
  const refreshToken = req.get('x-room-refresh-token');
  const access = verifyRoomRefreshToken(refreshToken, roomId);
  if (!access) {
    return res.status(401).json({ success: false, message: 'A valid room refresh token is required' });
  }
  try {
    const room = isDbConnected()
      ? await Room.findOne({ roomId, isActive: true }).select('roomId hostId hostName').lean()
      : inMemoryRooms.get(roomId);
    if (!room || room.isActive === false) {
      return res.status(404).json({ success: false, message: 'Meeting room not found or no longer active' });
    }
    const isCurrentHost = String(room.hostId) === access.participantId
      || String(room.hostId) === String(access.accountId || '');
    return res.json({
      success: true,
      accessToken: issueRoomAccessToken({
        ...access,
        role: isCurrentHost ? 'host' : 'participant',
        displayName: isCurrentHost ? room.hostName : access.displayName,
      }),
    });
  } catch (error) {
    console.error('Refresh room access error:', error);
    return res.status(503).json({ success: false, message: 'Could not refresh meeting access' });
  }
});

router.get('/:roomId/ice-config', requireRoomAccess, (_req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];
  const turnUrls = (process.env.TURN_URLS || '').split(',').map((url) => url.trim()).filter(Boolean);
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;
  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
  } else if (turnUrls.length > 0 || turnUsername || turnCredential) {
    return res.status(503).json({
      success: false,
      message: 'TURN_URLS, TURN_USERNAME, and TURN_CREDENTIAL must all be configured together',
    });
  }
  return res.json({ success: true, iceServers });
});

// @route   GET /api/rooms/:roomId/state
// @desc    Get complete authoritative room state for rehydration on reload/rejoin
// @access  Protected by room access token
router.get('/:roomId/state', requireRoomAccess, async (req, res) => {
  const { roomId } = req.params;
  const access = req.roomAccess;

  try {
    let room = null;
    if (isDbConnected()) {
      room = await Room.findOne({ roomId, isActive: true })
        .select('roomId title hostId hostName isLocked settings agenda isActive createdAt participants')
        .lean();
    } else {
      room = inMemoryRooms.get(roomId);
    }

    if (!room || room.isActive === false) {
      return res.status(404).json({ success: false, message: 'Meeting room is inactive or not found' });
    }

    let activeBreakout = null;
    if (isDbConnected()) {
      activeBreakout = await BreakoutSession.findOne({ roomId, status: 'active' }).lean();
    } else {
      activeBreakout = (breakoutSessions.get(roomId) || []).find((b) => b.status === 'active');
    }

    const isCurrentHost = String(room.hostId) === access.participantId
      || String(room.hostId) === String(access.accountId || '');
    const effectiveRole = room.hostId ? (isCurrentHost ? 'host' : 'participant') : access.role;
    return res.json({
      success: true,
      state: {
        roomId: room.roomId,
        title: room.title,
        hostId: room.hostId,
        hostName: room.hostName,
        isLocked: Boolean(room.isLocked),
        isActive: true,
        createdAt: room.createdAt,
        agenda: room.agenda || [],
        settings: room.settings || {},
        participants: (room.participants || []).map((p) => ({
          userId: String(p.userId),
          name: p.name,
          role: String(p.userId) === String(room.hostId) ? 'host' : 'participant',
          isMuted: Boolean(p.isMuted),
          isVideoOff: Boolean(p.isVideoOff),
          joinedAt: p.joinedAt,
          isDisconnected: Boolean(p.isDisconnected || !p.socketId),
        })),
        caller: {
          participantId: access.participantId,
          role: effectiveRole,
          isHost: effectiveRole === 'host',
          displayName: access.displayName,
        },
        activeBreakout: activeBreakout ? {
          id: activeBreakout.id,
          groups: activeBreakout.groups,
          endsAt: activeBreakout.endsAt,
        } : null,
      },
    });
  } catch (error) {
    console.error('Get room state error:', error);
    return res.status(500).json({ success: false, message: 'Server error retrieving room state' });
  }
});

// @route   GET /api/rooms/:roomId
// @desc    Get room details & public verification
// @access  Public
router.get('/:roomId', requireRoomAccess, async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = isDbConnected()
      ? await Room.findOne({ roomId })
        .select('roomId title hostName isLocked settings agenda isActive createdAt')
        .lean()
      : inMemoryRooms.get(roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Meeting room not found' });

    return res.json({
      success: true,
      room: {
        roomId: room.roomId,
        title: room.title,
        hostName: room.hostName,
        isLocked: Boolean(room.isLocked),
        settings: room.settings,
        agenda: room.agenda || [],
        isActive: room.isActive !== false,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    console.error('Get room error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching room' });
  }
});

export default router;
