import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { Room } from '../models/Room.js';
import { ScheduledMeeting } from '../models/ScheduledMeeting.js';
import { isDbConnected } from '../config/db.js';
import { inMemoryRooms, scheduledMeetings } from '../store/memoryMeetingStore.js';

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production' ? '' : 'local-development-only-change-before-deployment'
);

function readToken(req) {
  const headerToken = req.get('x-room-access-token');
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : '';
  return headerToken || bearerToken;
}

export function issueRoomAccessToken({ roomId, participantId, role, displayName, accountId }) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured before issuing room access tokens');
  const claims = { type: 'room-access', roomId, participantId, role, displayName };
  if (typeof accountId === 'string' && accountId.trim()) claims.accountId = accountId;
  return jwt.sign(
    claims,
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function verifyRoomAccessToken(token, roomId) {
  if (!JWT_SECRET || typeof token !== 'string' || !token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (
      payload.type !== 'room-access'
      || payload.roomId !== roomId
      || typeof payload.participantId !== 'string'
      || (payload.accountId !== undefined
        && (typeof payload.accountId !== 'string' || !payload.accountId.trim() || payload.accountId.length > 120))
      || !['host', 'participant'].includes(payload.role)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function requireRoomAccess(req, res, next, { allowEnded = false } = {}) {
  const { roomId } = req.params;
  if (typeof roomId !== 'string' || !roomId.trim() || roomId.length > 120) {
    return res.status(400).json({ success: false, message: 'A valid room ID is required' });
  }
  const access = verifyRoomAccessToken(readToken(req), roomId);
  if (!access) {
    return res.status(401).json({ success: false, message: 'A valid room access token is required' });
  }
  try {
    let room;
    let scheduled;
    if (isDbConnected()) {
      room = await Room.findOne({ roomId }).select('isActive isLocked admittedParticipantIds').lean();
      if (!room || !room.isLocked) {
        scheduled = await ScheduledMeeting.findOne({ roomId }).select('status invitees').lean();
      }
    } else {
      room = inMemoryRooms.get(roomId);
      if (!room || !room.isLocked) scheduled = scheduledMeetings.get(roomId);
    }

    if (
      (room?.isActive === false && !allowEnded)
      || (scheduled && scheduled.status !== 'scheduled' && !allowEnded)
    ) {
      return res.status(404).json({ success: false, message: 'Meeting room not found or no longer active' });
    }

    // A valid room ticket remains usable when process-local room metadata was lost on restart.
    // Tickets cannot be minted by clients, and persisted inactive rooms are rejected above.
    const admitted = room?.admittedParticipantIds?.includes(access.participantId);
    const scheduledMeetingIsPrivate = Boolean(scheduled?.invitees?.length);
    if ((room?.isLocked || scheduledMeetingIsPrivate) && access.role !== 'host' && !admitted) {
      return res.status(403).json({ success: false, message: 'This room is locked; host admission is required' });
    }
  } catch (error) {
    console.error('Verify room admission error:', error);
    return res.status(503).json({ success: false, message: 'Could not verify meeting room access' });
  }
  req.roomAccess = access;
  return next();
}

export function requireRoomHistoryAccess(req, res, next) {
  return requireRoomAccess(req, res, next, { allowEnded: true });
}

export function requireRoomArchiveWriteAccess(req, res, next) {
  return requireRoomAccess(req, res, next, { allowEnded: true });
}

export function requireRoomHost(req, res, next) {
  if (req.roomAccess?.role !== 'host') {
    return res.status(403).json({ success: false, message: 'Host access is required for this action' });
  }
  return next();
}

export function verifySocketRoomAccess(token, roomId) {
  return verifyRoomAccessToken(token, roomId);
}
