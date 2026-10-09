import { randomUUID } from 'node:crypto';
import express from 'express';
import { AINote } from '../models/AINote.js';
import { BreakoutSession } from '../models/BreakoutSession.js';
import { MeetingAgenda } from '../models/MeetingAgenda.js';
import { MeetingPoll } from '../models/MeetingPoll.js';
import { MeetingQuestion } from '../models/MeetingQuestion.js';
import { Room } from '../models/Room.js';
import { ScheduledMeeting } from '../models/ScheduledMeeting.js';
import { isDbConnected } from '../config/db.js';
import { issueRoomAccessToken, requireRoomAccess, requireRoomHost } from '../middleware/roomAccessMiddleware.js';
import { optionalProtect } from '../middleware/authMiddleware.js';
import {
  breakoutSessions,
  inMemoryRooms,
  roomAgendas,
  roomPolls,
  roomQuestions,
  scheduledMeetings,
} from '../store/memoryMeetingStore.js';

const router = express.Router();
const roomNotes = new Map();
const templates = [
  { id: 'general', title: 'General meeting', agenda: ['Context and goals', 'Discussion', 'Decisions and next steps'] },
  { id: 'standup', title: 'Team standup', agenda: ['What changed since last sync?', 'What is next?', 'Blockers and owners'] },
  { id: 'planning', title: 'Planning session', agenda: ['Review goals', 'Estimate and prioritize work', 'Confirm owners and deadlines'] },
  { id: 'retrospective', title: 'Retrospective', agenda: ['What went well?', 'What could improve?', 'Choose experiments and owners'] },
  { id: 'discovery', title: 'Customer discovery', agenda: ['Customer context', 'Needs and pain points', 'Open questions and follow-up'] },
];

function validateAgenda(agenda) {
  if (!Array.isArray(agenda) || agenda.length > 20) return null;
  const cleaned = agenda.map((item) => ({
    id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 80) : randomUUID(),
    text: typeof item?.text === 'string' ? item.text.trim() : '',
    isCompleted: item?.isCompleted === undefined ? false : item.isCompleted,
  }));
  if (cleaned.some((item) => !item.text || item.text.length > 300 || typeof item.isCompleted !== 'boolean')) {
    return null;
  }
  return new Set(cleaned.map((item) => item.id)).size === cleaned.length ? cleaned : null;
}

function cleanActionItems(items) {
  if (!Array.isArray(items) || items.length > 100) return null;
  const cleaned = items.map((item, index) => ({
    id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 80) : `action-${index + 1}`,
    task: typeof item?.task === 'string' ? item.task.trim() : '',
    assignee: typeof item?.assignee === 'string' ? item.assignee.trim().slice(0, 120) : 'Unassigned',
    priority: ['High', 'Medium', 'Low'].includes(item?.priority) ? item.priority : 'Medium',
    isCompleted: item?.isCompleted === undefined ? false : item.isCompleted,
  }));
  if (cleaned.some((item) => !item.task || item.task.length > 500 || typeof item.isCompleted !== 'boolean')) {
    return null;
  }
  return new Set(cleaned.map((item) => item.id)).size === cleaned.length ? cleaned : null;
}

function validRoomId(roomId) {
  return typeof roomId === 'string' && roomId.trim().length > 0 && roomId.length <= 120;
}

function serializeNotes(notes) {
  if (!notes) return null;
  return {
    roomId: notes.roomId,
    summary: notes.summary,
    decisions: notes.decisions,
    actionItems: notes.actionItems.map((item) => ({
      id: item.id,
      task: item.task,
      assignee: item.assignee,
      priority: item.priority,
      isCompleted: item.isCompleted,
    })),
    openQuestions: notes.openQuestions,
    generatedAt: notes.generatedAt,
  };
}

function serializeAgenda(agenda) {
  return agenda.map((item) => ({
    id: item.id,
    text: item.text,
    isCompleted: item.isCompleted,
  }));
}

function schedulePayload(body, existing = {}) {
  const title = typeof body?.title === 'string' ? body.title.trim() : existing.title;
  const startsAt = body?.startsAt ? new Date(body.startsAt) : existing.startsAt;
  const durationMinutes = body?.durationMinutes ?? existing.durationMinutes;
  const timeZone = typeof body?.timeZone === 'string' ? body.timeZone.trim() : existing.timeZone;
  const agenda = body?.agenda === undefined ? existing.agenda : validateAgenda(body.agenda);
  if (!title || title.length > 150 || !(startsAt instanceof Date) || Number.isNaN(startsAt.valueOf())) return null;
  if (startsAt <= new Date() || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) return null;
  if (!timeZone || timeZone.length > 100 || !agenda) return null;
  return {
    title,
    startsAt,
    durationMinutes,
    timeZone,
    templateId: typeof body?.templateId === 'string' ? body.templateId.slice(0, 80) : existing.templateId || 'general',
    agenda,
    invitees: Array.isArray(body?.invitees)
      ? body.invitees.filter((email) => typeof email === 'string' && email.length <= 254).slice(0, 50)
      : existing.invitees || [],
  };
}

async function expireBreakouts(roomId, now = new Date()) {
  if (isDbConnected()) {
    await BreakoutSession.updateMany(
      { roomId, status: 'active', endsAt: { $lte: now } },
      { $set: { status: 'ended' } }
    );
    return;
  }

  for (const session of breakoutSessions.get(roomId) || []) {
    const endsAt = session.endsAt ? new Date(session.endsAt).getTime() : NaN;
    if (session.status === 'active' && Number.isFinite(endsAt) && endsAt <= now.getTime()) {
      session.status = 'ended';
    }
  }
}

router.get('/templates', (_req, res) => res.json({ success: true, templates }));

router.use('/rooms/:roomId', requireRoomAccess);

router.get('/schedules', async (_req, res) => {
  try {
    const meetings = isDbConnected()
      ? await ScheduledMeeting.find({
        status: 'scheduled',
        startsAt: { $gte: new Date() },
        $or: [{ invitees: { $exists: false } }, { invitees: { $size: 0 } }],
      })
        .select('-invitees -createdBy')
        .sort({ startsAt: 1 })
        .limit(100)
        .lean()
      : [...scheduledMeetings.values()]
        .filter((meeting) => (
          meeting.status === 'scheduled'
          && !meeting.invitees?.length
          && new Date(meeting.startsAt) >= new Date()
        ))
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    return res.json({ success: true, meetings: meetings.map(({ invitees, createdBy, ...meeting }) => meeting) });
  } catch (error) {
    console.error('List scheduled meetings error:', error);
    return res.status(500).json({ success: false, message: 'Could not load scheduled meetings' });
  }
});

router.get('/schedules/:roomId', async (req, res) => {
  try {
    const meeting = isDbConnected()
      ? await ScheduledMeeting.findOne({ roomId: req.params.roomId, status: 'scheduled' })
        .lean()
      : scheduledMeetings.get(req.params.roomId) || null;
    if (!meeting) return res.status(404).json({ success: false, message: 'Scheduled meeting not found' });
    const sendMeeting = () => {
      const { invitees, createdBy, ...publicMeeting } = meeting;
      return res.json({ success: true, meeting: publicMeeting });
    };
    if (meeting.invitees?.length) {
      return requireRoomAccess(req, res, sendMeeting);
    }
    return sendMeeting();
  } catch (error) {
    console.error('Get scheduled meeting error:', error);
    return res.status(500).json({ success: false, message: 'Could not load scheduled meeting' });
  }
});

router.post('/schedules', optionalProtect, async (req, res) => {
  const payload = schedulePayload(req.body);
  if (!payload) {
    return res.status(400).json({ success: false, message: 'Provide a title, future start time, time zone, valid duration, and up to 20 agenda items' });
  }

  const roomId = `room-${randomUUID()}`;
  const hostId = req.user ? String(req.user.id || req.user._id) : `guest-${randomUUID()}`;
  const meeting = {
    ...payload,
    roomId,
    status: 'scheduled',
    createdBy: hostId,
  };
  try {
    let saved;
    if (isDbConnected()) {
      saved = await ScheduledMeeting.create(meeting);
      try {
        await Room.create({
          roomId,
          title: meeting.title,
          hostId,
          hostName: req.user?.name || (typeof req.body?.hostName === 'string' ? req.body.hostName.slice(0, 120) : 'Meeting Host'),
          isLocked: meeting.invitees.length > 0,
          isActive: true,
          attendeeIds: [],
          agenda: meeting.agenda,
        });
      } catch (error) {
        await ScheduledMeeting.deleteOne({ roomId });
        throw error;
      }
    } else {
      scheduledMeetings.set(roomId, meeting);
      inMemoryRooms.set(roomId, {
        roomId,
        title: meeting.title,
        hostId,
        hostName: req.user?.name || (typeof req.body?.hostName === 'string' ? req.body.hostName.slice(0, 120) : 'Meeting Host'),
        isLocked: meeting.invitees.length > 0,
        settings: { allowScreenShare: true, allowAINotes: true, allowChat: true, allowWhiteboard: true },
        participants: [],
        isActive: true,
        attendeeIds: [],
        agenda: meeting.agenda,
        createdAt: new Date(),
      });
      saved = meeting;
    }
    const accessToken = issueRoomAccessToken({
      roomId,
      participantId: hostId,
      role: 'host',
      displayName: req.user?.name
        || (typeof req.body?.hostName === 'string' ? req.body.hostName.slice(0, 120) : 'Meeting Host'),
      ...(req.user ? { accountId: hostId } : {}),
    });
    const { invitees, ...publicMeeting } = saved.toObject ? saved.toObject() : saved;
    return res.status(201).json({ success: true, meeting: publicMeeting, accessToken });
  } catch (error) {
    console.error('Create scheduled meeting error:', error);
    return res.status(500).json({ success: false, message: 'Could not schedule meeting' });
  }
});

router.delete('/schedules/:roomId', requireRoomAccess, requireRoomHost, async (req, res) => {
  try {
    if (isDbConnected()) {
      const meeting = await ScheduledMeeting.findOneAndUpdate(
        { roomId: req.params.roomId, status: 'scheduled' },
        { status: 'cancelled' },
        { returnDocument: 'after' }
      );
      if (!meeting) return res.status(404).json({ success: false, message: 'Scheduled meeting not found' });
      await Room.updateOne({ roomId: req.params.roomId }, { $set: { isActive: false, endedAt: new Date() } });
    } else {
      const meeting = scheduledMeetings.get(req.params.roomId);
      if (!meeting || meeting.status !== 'scheduled') {
        return res.status(404).json({ success: false, message: 'Scheduled meeting not found' });
      }
      meeting.status = 'cancelled';
      const room = inMemoryRooms.get(req.params.roomId);
      if (room) room.isActive = false;
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Cancel scheduled meeting error:', error);
    return res.status(500).json({ success: false, message: 'Could not cancel scheduled meeting' });
  }
});

router.get('/rooms/:roomId/notes', async (req, res) => {
  if (!validRoomId(req.params.roomId)) {
    return res.status(400).json({ success: false, message: 'A valid room ID is required' });
  }
  try {
    const notes = isDbConnected()
      ? await AINote.findOne({ roomId: req.params.roomId }).lean()
      : roomNotes.get(req.params.roomId) || null;
    return res.json({ success: true, notes: serializeNotes(notes) });
  } catch (error) {
    console.error('Load meeting notes error:', error);
    return res.status(500).json({ success: false, message: 'Could not load meeting notes' });
  }
});

router.put('/rooms/:roomId/notes', async (req, res) => {
  if (!validRoomId(req.params.roomId)) {
    return res.status(400).json({ success: false, message: 'A valid room ID is required' });
  }
  const { summary, decisions, openQuestions } = req.body || {};
  const actionItems = cleanActionItems(req.body?.actionItems);
  if (typeof summary !== 'string' || summary.length > 30000 || !Array.isArray(decisions) || decisions.length > 100
    || decisions.some((item) => typeof item !== 'string' || !item.trim() || item.length > 2000)
    || !Array.isArray(openQuestions) || openQuestions.length > 100
    || openQuestions.some((item) => typeof item !== 'string' || !item.trim() || item.length > 2000)
    || !actionItems) {
    return res.status(400).json({ success: false, message: 'Meeting notes contain invalid or oversized fields' });
  }

  const notes = {
    roomId: req.params.roomId,
    summary,
    decisions,
    actionItems,
    openQuestions,
    generatedAt: new Date(),
  };
  try {
    const saved = isDbConnected()
      ? await AINote.findOneAndUpdate(
        { roomId: req.params.roomId },
        { $set: notes },
        { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
      )
      : (roomNotes.set(req.params.roomId, notes), notes);
    return res.json({ success: true, notes: serializeNotes(saved) });
  } catch (error) {
    console.error('Save meeting notes error:', error);
    return res.status(500).json({ success: false, message: 'Could not save meeting notes' });
  }
});

router.get('/rooms/:roomId/agenda', async (req, res) => {
  if (!validRoomId(req.params.roomId)) {
    return res.status(400).json({ success: false, message: 'A valid room ID is required' });
  }
  try {
    if (isDbConnected()) {
      const [savedAgenda, room, scheduled] = await Promise.all([
        MeetingAgenda.findOne({ roomId: req.params.roomId }).select('agenda').lean(),
        Room.findOne({ roomId: req.params.roomId }).select('agenda').lean(),
        ScheduledMeeting.findOne({ roomId: req.params.roomId }).select('agenda').lean(),
      ]);
      return res.json({
        success: true,
        agenda: serializeAgenda(savedAgenda?.agenda || room?.agenda || scheduled?.agenda || []),
      });
    }
    const scheduled = scheduledMeetings.get(req.params.roomId);
    return res.json({
      success: true,
      agenda: serializeAgenda(roomAgendas.get(req.params.roomId) || scheduled?.agenda || []),
    });
  } catch (error) {
    console.error('Load meeting agenda error:', error);
    return res.status(500).json({ success: false, message: 'Could not load meeting agenda' });
  }
});

router.put('/rooms/:roomId/agenda', async (req, res) => {
  if (!validRoomId(req.params.roomId)) {
    return res.status(400).json({ success: false, message: 'A valid room ID is required' });
  }
  const agenda = validateAgenda(req.body?.agenda);
  if (!agenda) {
    return res.status(400).json({ success: false, message: 'Provide up to 20 agenda items of no more than 300 characters each' });
  }
  try {
    if (isDbConnected()) {
      const saved = await MeetingAgenda.findOneAndUpdate(
        { roomId: req.params.roomId },
        { $set: { agenda } },
        { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      return res.json({ success: true, agenda: serializeAgenda(saved.agenda) });
    }
    roomAgendas.set(req.params.roomId, agenda);
    return res.json({ success: true, agenda });
  } catch (error) {
    console.error('Save meeting agenda error:', error);
    return res.status(500).json({ success: false, message: 'Could not save meeting agenda' });
  }
});

router.get('/rooms/:roomId/polls', async (req, res) => {
  try {
    const polls = isDbConnected()
      ? await MeetingPoll.find({ roomId: req.params.roomId }).sort({ createdAt: -1 }).lean()
      : roomPolls.get(req.params.roomId) || [];
    return res.json({ success: true, polls });
  } catch (error) {
    console.error('Load meeting polls error:', error);
    return res.status(500).json({ success: false, message: 'Could not load meeting polls' });
  }
});

router.post('/rooms/:roomId/polls', async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  const optionText = Array.isArray(req.body?.options)
    ? req.body.options.map((option) => typeof option === 'string' ? option.trim() : '').filter(Boolean)
    : [];
  if (!question || question.length > 300 || optionText.length < 2 || optionText.length > 8
    || optionText.some((option) => option.length > 120)
    || new Set(optionText.map((option) => option.toLowerCase())).size !== optionText.length
    || (req.body?.allowMultiple !== undefined && typeof req.body.allowMultiple !== 'boolean')) {
    return res.status(400).json({ success: false, message: 'Provide a question and 2–8 distinct options' });
  }
  const poll = {
    id: randomUUID(),
    roomId: req.params.roomId,
    question,
    options: optionText.map((text) => ({ id: randomUUID(), text, voters: [] })),
    allowMultiple: req.body?.allowMultiple === true,
    status: 'open',
    createdBy: req.roomAccess.participantId,
  };
  try {
    const saved = isDbConnected()
      ? await MeetingPoll.create(poll)
      : (roomPolls.set(req.params.roomId, [poll, ...(roomPolls.get(req.params.roomId) || [])]), poll);
    return res.status(201).json({ success: true, poll: saved });
  } catch (error) {
    console.error('Create meeting poll error:', error);
    return res.status(500).json({ success: false, message: 'Could not create poll' });
  }
});

router.post('/rooms/:roomId/polls/:pollId/votes', async (req, res) => {
  const voterId = req.roomAccess.participantId;
  const selectedIds = Array.isArray(req.body?.optionIds) ? [...new Set(req.body.optionIds)] : [];
  if (!voterId || !selectedIds.length || selectedIds.length > 8
    || selectedIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ success: false, message: 'Select at least one valid option to vote' });
  }
  try {
    const poll = isDbConnected()
      ? await MeetingPoll.findOne({ id: req.params.pollId, roomId: req.params.roomId })
      : (roomPolls.get(req.params.roomId) || []).find((item) => item.id === req.params.pollId);
    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });
    if (poll.status !== 'open') return res.status(409).json({ success: false, message: 'This poll is closed' });
    if ((!poll.allowMultiple && selectedIds.length !== 1)
      || selectedIds.some((id) => !poll.options.some((option) => String(option.id) === id))) {
      return res.status(400).json({ success: false, message: 'Selected options are not valid for this poll' });
    }
    poll.options.forEach((option) => {
      option.voters = option.voters.filter((id) => id !== voterId);
      if (selectedIds.includes(String(option.id))) option.voters.push(voterId);
    });
    if (isDbConnected()) await poll.save();
    return res.json({ success: true, poll });
  } catch (error) {
    console.error('Record meeting poll vote error:', error);
    return res.status(500).json({ success: false, message: 'Could not record vote' });
  }
});

router.patch('/rooms/:roomId/polls/:pollId/close', requireRoomHost, async (req, res) => {
  try {
    const poll = isDbConnected()
      ? await MeetingPoll.findOne({ id: req.params.pollId, roomId: req.params.roomId })
      : (roomPolls.get(req.params.roomId) || []).find((item) => item.id === req.params.pollId);
    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });
    poll.status = 'closed';
    if (isDbConnected()) await poll.save();
    return res.json({ success: true, poll });
  } catch (error) {
    console.error('Close meeting poll error:', error);
    return res.status(500).json({ success: false, message: 'Could not close poll' });
  }
});

router.get('/rooms/:roomId/questions', async (req, res) => {
  try {
    const questions = isDbConnected()
      ? await MeetingQuestion.find({ roomId: req.params.roomId }).sort({ status: 1, createdAt: -1 }).lean()
      : roomQuestions.get(req.params.roomId) || [];
    return res.json({ success: true, questions });
  } catch (error) {
    console.error('Load meeting questions error:', error);
    return res.status(500).json({ success: false, message: 'Could not load meeting questions' });
  }
});

router.post('/rooms/:roomId/questions', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const authorId = req.roomAccess.participantId;
  const authorName = req.roomAccess.displayName || 'Participant';
  if (!text || text.length > 1000 || !authorId || !authorName) {
    return res.status(400).json({ success: false, message: 'Provide a question (up to 1000 characters) and participant name' });
  }
  const question = { id: randomUUID(), roomId: req.params.roomId, text, authorId, authorName, upvoterIds: [], status: 'open' };
  try {
    const saved = isDbConnected()
      ? await MeetingQuestion.create(question)
      : (roomQuestions.set(req.params.roomId, [question, ...(roomQuestions.get(req.params.roomId) || [])]), question);
    return res.status(201).json({ success: true, question: saved });
  } catch (error) {
    console.error('Create meeting question error:', error);
    return res.status(500).json({ success: false, message: 'Could not submit your question' });
  }
});

router.post('/rooms/:roomId/questions/:questionId/upvote', async (req, res) => {
  const voterId = req.roomAccess.participantId;
  if (!voterId) return res.status(400).json({ success: false, message: 'A participant ID is required to upvote' });
  try {
    const question = isDbConnected()
      ? await MeetingQuestion.findOne({ id: req.params.questionId, roomId: req.params.roomId })
      : (roomQuestions.get(req.params.roomId) || []).find((item) => item.id === req.params.questionId);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
    const hasUpvoted = question.upvoterIds.includes(voterId);
    question.upvoterIds = hasUpvoted
      ? question.upvoterIds.filter((id) => id !== voterId)
      : [...question.upvoterIds, voterId];
    if (isDbConnected()) await question.save();
    return res.json({ success: true, question });
  } catch (error) {
    console.error('Upvote meeting question error:', error);
    return res.status(500).json({ success: false, message: 'Could not update question vote' });
  }
});

router.patch('/rooms/:roomId/questions/:questionId/answer', requireRoomHost, async (req, res) => {
  try {
    const question = isDbConnected()
      ? await MeetingQuestion.findOne({ id: req.params.questionId, roomId: req.params.roomId })
      : (roomQuestions.get(req.params.roomId) || []).find((item) => item.id === req.params.questionId);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
    question.status = question.status === 'answered' ? 'open' : 'answered';
    if (isDbConnected()) await question.save();
    return res.json({ success: true, question });
  } catch (error) {
    console.error('Mark meeting question answered error:', error);
    return res.status(500).json({ success: false, message: 'Could not update question status' });
  }
});

router.get('/rooms/:roomId/breakouts', async (req, res) => {
  try {
    await expireBreakouts(req.params.roomId);
    const breakout = isDbConnected()
      ? await BreakoutSession.findOne({ roomId: req.params.roomId, status: 'active' }).sort({ createdAt: -1 }).lean()
      : (breakoutSessions.get(req.params.roomId) || []).find((item) => item.status === 'active') || null;
    return res.json({ success: true, breakout });
  } catch (error) {
    console.error('Load breakout session error:', error);
    return res.status(500).json({ success: false, message: 'Could not load breakout rooms' });
  }
});

router.post('/rooms/:roomId/breakouts', requireRoomHost, async (req, res) => {
  const groups = req.body?.groups;
  if (!Array.isArray(groups) || groups.length < 2 || groups.length > 20
    || groups.some((group) => typeof group?.name !== 'string' || !group.name.trim()
      || group.name.length > 80 || !Array.isArray(group.participantIds)
      || group.participantIds.length > 50
      || (group.id !== undefined && (typeof group.id !== 'string' || !group.id.trim() || group.id.length > 80))
      || group.participantIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 120))) {
    return res.status(400).json({ success: false, message: 'Provide 2–20 breakout rooms with valid participant assignments' });
  }
  const normalizedGroups = groups.map((group, index) => ({
    id: group.id?.trim() || `group-${index + 1}`,
    name: group.name.trim(),
    participantIds: group.participantIds.map((id) => id.trim()),
  }));
  if (new Set(normalizedGroups.map((group) => group.id)).size !== normalizedGroups.length) {
    return res.status(400).json({ success: false, message: 'Breakout room IDs must be unique' });
  }
  const allParticipants = normalizedGroups.flatMap((group) => group.participantIds);
  if (new Set(allParticipants).size !== allParticipants.length) {
    return res.status(400).json({ success: false, message: 'A participant cannot be assigned to multiple breakout rooms' });
  }
  const breakout = {
    id: randomUUID(),
    roomId: req.params.roomId,
    status: 'active',
    groups: normalizedGroups,
    endsAt: req.body?.endsAt ? new Date(req.body.endsAt) : undefined,
    createdBy: req.roomAccess.participantId,
  };
  if (breakout.endsAt && Number.isNaN(breakout.endsAt.valueOf())) {
    return res.status(400).json({ success: false, message: 'Breakout end time is invalid' });
  }
  if (breakout.endsAt && (breakout.endsAt <= new Date()
    || breakout.endsAt.getTime() > Date.now() + 8 * 60 * 60 * 1000)) {
    return res.status(400).json({ success: false, message: 'Breakout end time must be within the next 8 hours' });
  }
  try {
    await expireBreakouts(req.params.roomId);
    const active = isDbConnected()
      ? await BreakoutSession.findOne({ roomId: req.params.roomId, status: 'active' }).select('id').lean()
      : (breakoutSessions.get(req.params.roomId) || []).find((item) => item.status === 'active');
    if (active) return res.status(409).json({ success: false, message: 'A breakout session is already active' });
    const saved = isDbConnected()
      ? await BreakoutSession.create(breakout)
      : (breakoutSessions.set(req.params.roomId, [breakout, ...(breakoutSessions.get(req.params.roomId) || [])]), breakout);
    return res.status(201).json({ success: true, breakout: saved });
  } catch (error) {
    console.error('Create breakout session error:', error);
    return res.status(500).json({ success: false, message: 'Could not start breakout rooms' });
  }
});

router.patch('/rooms/:roomId/breakouts/:breakoutId/end', requireRoomHost, async (req, res) => {
  try {
    const breakout = isDbConnected()
      ? await BreakoutSession.findOne({ id: req.params.breakoutId, roomId: req.params.roomId, status: 'active' })
      : (breakoutSessions.get(req.params.roomId) || []).find((item) => item.id === req.params.breakoutId && item.status === 'active');
    if (!breakout) return res.status(404).json({ success: false, message: 'Active breakout session not found' });
    breakout.status = 'ended';
    if (isDbConnected()) await breakout.save();
    return res.json({ success: true, breakout });
  } catch (error) {
    console.error('End breakout session error:', error);
    return res.status(500).json({ success: false, message: 'Could not end breakout rooms' });
  }
});

export default router;
