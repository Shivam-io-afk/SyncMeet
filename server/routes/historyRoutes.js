import express from 'express';
import { AINote } from '../models/AINote.js';
import { MeetingAttendance } from '../models/MeetingAttendance.js';
import { Room } from '../models/Room.js';
import { HiddenMeeting } from '../models/HiddenMeeting.js';
import { Transcript } from '../models/Transcript.js';
import { isDbConnected } from '../config/db.js';
import {
  requireRoomArchiveWriteAccess,
  requireRoomHistoryAccess,
  requireRoomHost,
} from '../middleware/roomAccessMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';
import {
  inMemoryHistory,
  inMemoryMeetingAttendance,
  inMemoryRooms,
} from '../store/memoryMeetingStore.js';

const router = express.Router();
const MAX_TRANSCRIPT_ENTRIES = 2_000;
const MAX_TRANSCRIPT_CHARACTERS = 500_000;
const inMemoryHiddenMeetings = new Map();

function isHidden(hiddenByRoom, meeting) {
  const hiddenAt = hiddenByRoom.get(meeting.roomId);
  return Boolean(hiddenAt) && new Date(meeting.endedAt) <= new Date(hiddenAt);
}

function validateArchive(body) {
  const { transcripts } = body;
  if (!Array.isArray(transcripts) || transcripts.length > MAX_TRANSCRIPT_ENTRIES) return null;
  let characterCount = 0;
  for (const entry of transcripts) {
    if (
      !entry
      || typeof entry.speaker !== 'string'
      || !entry.speaker.trim()
      || entry.speaker.length > 120
      || typeof entry.text !== 'string'
      || entry.text.length > 10_000
      || typeof entry.timestamp !== 'string'
      || entry.timestamp.length > 100
    ) return null;
    characterCount += entry.text.length;
    if (characterCount > MAX_TRANSCRIPT_CHARACTERS) return null;
  }

  const notes = body.aiNotes;
  if (notes !== undefined && notes !== null) {
    if (
      typeof notes !== 'object'
      || typeof notes.summary !== 'string'
      || notes.summary.length > 30_000
      || !Array.isArray(notes.decisions)
      || notes.decisions.length > 100
      || notes.decisions.some((item) => typeof item !== 'string' || item.length > 2_000)
      || !Array.isArray(notes.actionItems)
      || notes.actionItems.length > 100
      || notes.actionItems.some((item) => (
        !item
        || typeof item.task !== 'string'
        || item.task.length > 500
        || (item.assignee !== undefined && (typeof item.assignee !== 'string' || item.assignee.length > 120))
      ))
      || !Array.isArray(notes.openQuestions)
      || notes.openQuestions.length > 100
      || notes.openQuestions.some((item) => typeof item !== 'string' || item.length > 2_000)
    ) return null;
  }
  return true;
}

function archivePayload(room, access, body) {
  return {
    roomId: access.roomId,
    title: room.title,
    hostName: room.hostName,
    duration: typeof body.duration === 'string' && body.duration.length <= 40 ? body.duration : '',
    createdAt: new Date().toISOString(),
    transcriptsCount: body.transcripts.length,
    transcripts: body.transcripts,
    aiNotes: body.aiNotes || null,
  };
}

router.get('/recent', protect, async (req, res) => {
  const userId = String(req.user.id || req.user._id);
  try {
    if (isDbConnected()) {
      const [attendance, legacyRooms] = await Promise.all([
        MeetingAttendance.find({ userId, leftAt: { $ne: null } })
          .sort({ leftAt: -1 })
          .limit(20)
          .lean(),
        Room.find({
          $and: [
            { $or: [{ hostId: userId }, { attendeeIds: userId }] },
            {
              $or: [
                { archivedAt: { $exists: true } },
                { isActive: false, endedAt: { $exists: true } },
              ],
            },
          ],
        })
          .select('roomId title hostName hostId createdAt endedAt archivedAt')
          .sort({ archivedAt: -1, endedAt: -1, createdAt: -1 })
          .limit(20)
          .lean(),
      ]);
      const meetingByRoom = new Map();
      for (const room of legacyRooms) {
        meetingByRoom.set(room.roomId, {
          roomId: room.roomId,
          title: room.title,
          hostName: room.hostName,
          createdAt: room.archivedAt || room.endedAt || room.createdAt,
          role: String(room.hostId) === userId ? 'host' : 'participant',
          joinedAt: room.createdAt,
          endedAt: room.archivedAt || room.endedAt || room.createdAt,
        });
      }
      for (const record of attendance) {
        const existing = meetingByRoom.get(record.roomId);
        if (existing && new Date(existing.endedAt) >= new Date(record.leftAt)) continue;
        meetingByRoom.set(record.roomId, {
          roomId: record.roomId,
          title: record.title,
          hostName: record.hostName,
          createdAt: record.leftAt,
          role: record.role,
          joinedAt: record.joinedAt,
          endedAt: record.leftAt,
        });
      }
      const hidden = await HiddenMeeting.find({ userId }).lean();
      const hiddenByRoom = new Map(hidden.map((item) => [item.roomId, item.hiddenAt]));
      const meetings = [...meetingByRoom.values()]
        .filter((meeting) => !isHidden(hiddenByRoom, meeting))
        .sort((left, right) => new Date(right.endedAt) - new Date(left.endedAt))
        .slice(0, 20);
      const transcriptCounts = await Transcript.aggregate([
        { $match: { roomId: { $in: meetings.map((meeting) => meeting.roomId) } } },
        { $group: { _id: '$roomId', count: { $sum: 1 } } },
      ]);
      const countsByRoom = new Map(transcriptCounts.map(({ _id, count }) => [_id, count]));
      return res.json({
        success: true,
        meetings: meetings.map((meeting) => ({
          ...meeting,
          transcriptCount: countsByRoom.get(meeting.roomId) || 0,
        })),
        storage: 'database',
      });
    }

    const meetingsByRoom = new Map([...inMemoryRooms.values()]
      .filter((room) => (
        (String(room.hostId) === userId || room.attendeeIds?.includes(userId))
        && (
          room.archivedAt
          || (room.isActive === false && room.endedAt)
        )
      ))
      .map((room) => {
        const archive = inMemoryHistory.get(room.roomId);
        return {
          roomId: room.roomId,
          title: room.title || archive?.title,
          hostName: room.hostName || archive?.hostName,
          createdAt: room.endedAt || room.archivedAt || room.createdAt,
          role: String(room.hostId) === userId ? 'host' : 'participant',
          joinedAt: room.createdAt,
          endedAt: room.endedAt || room.archivedAt || room.createdAt,
          transcriptCount: archive?.transcriptsCount || archive?.transcripts?.length || 0,
        };
      })
      .map((meeting) => [meeting.roomId, meeting]));
    for (const record of inMemoryMeetingAttendance.values()) {
      if (record.userId !== userId || !record.leftAt) continue;
      const existing = meetingsByRoom.get(record.roomId);
      if (existing && new Date(existing.endedAt) >= new Date(record.leftAt)) continue;
      meetingsByRoom.set(record.roomId, {
        roomId: record.roomId,
        title: record.title || existing?.title,
        hostName: record.hostName || existing?.hostName,
        createdAt: record.leftAt,
        role: record.role,
        joinedAt: record.joinedAt,
        endedAt: record.leftAt,
        transcriptCount: existing?.transcriptCount || 0,
      });
    }
    const hiddenByRoom = inMemoryHiddenMeetings.get(userId) || new Map();
    const meetings = [...meetingsByRoom.values()]
      .filter((meeting) => !isHidden(hiddenByRoom, meeting))
      .sort((left, right) => new Date(right.endedAt) - new Date(left.endedAt))
      .slice(0, 20);
    return res.json({ success: true, meetings, storage: 'memory' });
  } catch (error) {
    console.error('Recent meeting history error:', error);
    return res.status(500).json({ success: false, message: 'Could not load recent meetings' });
  }
});

router.delete('/recent/:roomId', protect, async (req, res) => {
  const userId = String(req.user.id || req.user._id);
  const roomId = String(req.params.roomId || '').trim();
  if (!roomId || roomId.length > 120) {
    return res.status(400).json({ success: false, message: 'Invalid room ID' });
  }
  const hiddenAt = new Date();
  try {
    if (isDbConnected()) {
      await HiddenMeeting.findOneAndUpdate(
        { userId, roomId },
        { hiddenAt },
        { upsert: true, returnDocument: 'after' },
      );
    } else {
      if (!inMemoryHiddenMeetings.has(userId)) inMemoryHiddenMeetings.set(userId, new Map());
      inMemoryHiddenMeetings.get(userId).set(roomId, hiddenAt);
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Hide meeting history error:', error);
    return res.status(500).json({ success: false, message: 'Could not remove meeting from history' });
  }
});

router.get('/account/:roomId', protect, async (req, res) => {
  const userId = String(req.user.id || req.user._id);
  const roomId = String(req.params.roomId || '').trim();
  if (!roomId || roomId.length > 120) {
    return res.status(400).json({ success: false, message: 'Invalid room ID' });
  }

  try {
    if (isDbConnected()) {
      const room = await Room.findOne({ roomId })
        .select('roomId title hostName hostId attendeeIds createdAt endedAt archivedAt isActive')
        .lean();
      if (!room) return res.status(404).json({ success: false, message: 'Meeting archive not found' });

      const isMember = String(room.hostId) === userId
        || room.attendeeIds?.includes(userId)
        || await MeetingAttendance.exists({ roomId, userId });
      const isComplete = Boolean(room.archivedAt || (room.isActive === false && room.endedAt));
      if (!isMember || !isComplete) {
        return res.status(404).json({ success: false, message: 'Meeting archive not found' });
      }

      const [transcripts, aiNotes] = await Promise.all([
        Transcript.find({ roomId }).sort({ createdAt: 1 }).lean(),
        AINote.findOne({ roomId }).lean(),
      ]);
      return res.json({
        success: true,
        record: {
          roomId: room.roomId,
          title: room.title,
          hostName: room.hostName,
          createdAt: room.archivedAt || room.endedAt || room.createdAt,
          transcripts,
          aiNotes,
        },
      });
    }

    const room = inMemoryRooms.get(roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Meeting archive not found' });
    const isMember = String(room.hostId) === userId
      || room.attendeeIds?.includes(userId)
      || [...inMemoryMeetingAttendance.values()].some((record) => (
        record.roomId === roomId && record.userId === userId
      ));
    const isComplete = Boolean(room.archivedAt || (room.isActive === false && room.endedAt));
    if (!isMember || !isComplete) {
      return res.status(404).json({ success: false, message: 'Meeting archive not found' });
    }

    const archive = inMemoryHistory.get(roomId);
    return res.json({
      success: true,
      record: {
        roomId,
        title: archive?.title || room.title,
        hostName: archive?.hostName || room.hostName,
        createdAt: archive?.createdAt || room.archivedAt || room.endedAt || room.createdAt,
        transcripts: archive?.transcripts || [],
        aiNotes: archive?.aiNotes || null,
      },
    });
  } catch (error) {
    console.error('Account meeting history error:', error);
    return res.status(500).json({ success: false, message: 'Could not load meeting archive' });
  }
});

router.post('/:roomId/save', requireRoomArchiveWriteAccess, requireRoomHost, async (req, res) => {
  if (!validateArchive(req.body || {})) {
    return res.status(400).json({ success: false, message: 'Meeting archive contains invalid or oversized data' });
  }

  try {
    const room = isDbConnected()
      ? await Room.findOne({ roomId: req.roomAccess.roomId }).select('roomId title hostName').lean()
      : inMemoryRooms.get(req.roomAccess.roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Meeting room not found' });

    const record = archivePayload(room, req.roomAccess, req.body);
    if (isDbConnected()) {
      await Room.updateOne(
        {
          roomId: req.roomAccess.roomId,
          $or: [
            { hostId: req.roomAccess.participantId },
            ...(req.roomAccess.accountId ? [{ hostId: req.roomAccess.accountId }] : []),
          ],
        },
        { $set: { archivedAt: new Date(record.createdAt) } }
      );
      await Transcript.deleteMany({ roomId: req.roomAccess.roomId });
      if (record.transcripts.length) {
        await Transcript.insertMany(record.transcripts.map((entry) => ({
          roomId: req.roomAccess.roomId,
          speaker: entry.speaker.trim(),
          text: entry.text,
          timestamp: entry.timestamp,
        })));
      }
      if (record.aiNotes) {
        await AINote.findOneAndUpdate(
          { roomId: req.roomAccess.roomId },
          {
            $set: {
              roomId: req.roomAccess.roomId,
              summary: record.aiNotes.summary,
              decisions: record.aiNotes.decisions,
              actionItems: record.aiNotes.actionItems,
              openQuestions: record.aiNotes.openQuestions,
              generatedAt: new Date(),
            },
          },
          { upsert: true, returnDocument: 'after', runValidators: true }
        );
      }
    } else {
      inMemoryHistory.set(req.roomAccess.roomId, record);
      const storedRoom = inMemoryRooms.get(req.roomAccess.roomId);
      if (storedRoom) {
        storedRoom.archivedAt = new Date(record.createdAt);
      }
    }

    return res.status(201).json({
      success: true,
      record: { ...record, transcripts: undefined },
      storage: isDbConnected() ? 'database' : 'memory',
    });
  } catch (error) {
    console.error('History save error:', error);
    return res.status(500).json({ success: false, message: 'Could not save meeting archive' });
  }
});

router.get('/:roomId', requireRoomHistoryAccess, async (req, res) => {
  try {
    if (isDbConnected()) {
      const room = await Room.findOne({ roomId: req.roomAccess.roomId }).select('roomId title hostName createdAt').lean();
      if (!room) return res.status(404).json({ success: false, message: 'Meeting archive not found' });
      const [transcripts, aiNotes] = await Promise.all([
        Transcript.find({ roomId: req.roomAccess.roomId }).sort({ createdAt: 1 }).lean(),
        AINote.findOne({ roomId: req.roomAccess.roomId }).lean(),
      ]);
      return res.json({ success: true, record: { ...room, transcripts, aiNotes } });
    }

    const record = inMemoryHistory.get(req.roomAccess.roomId);
    if (!record) return res.status(404).json({ success: false, message: 'Meeting archive not found' });
    return res.json({ success: true, record });
  } catch (error) {
    console.error('Fetch history error:', error);
    return res.status(500).json({ success: false, message: 'Could not load meeting archive' });
  }
});

export default router;
