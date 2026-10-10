import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import express from 'express';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import {
  breakoutSessions,
  inMemoryHistory,
  inMemoryMeetingAttendance,
  inMemoryRooms,
  roomPolls,
  scheduledMeetings,
} from '../server/store/memoryMeetingStore.js';
import featureRoutes from '../server/routes/meetingFeatureRoutes.js';
import { setupSocketHandlers } from '../server/socket/socketHandler.js';
import { generateToken } from '../server/middleware/authMiddleware.js';
import { issueRoomAccessToken, verifyRoomAccessToken } from '../server/middleware/roomAccessMiddleware.js';
import roomRoutes from '../server/routes/roomRoutes.js';
import aiRoutes from '../server/routes/aiRoutes.js';
import historyRoutes from '../server/routes/historyRoutes.js';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function waitForEvent(client, event, predicate = () => true, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const listener = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      client.off(event, listener);
      resolve(payload);
    };
    client.on(event, listener);
  });
}

async function connectParticipant(url, id, role = 'participant', claimHost = false, roomId = 'meeting-under-test') {
  const client = createClient(url, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out connecting ${id}`)), 3000);
    client.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    client.once('connect_error', reject);
  });
  const lockStatus = role === 'host' ? waitForEvent(client, 'room-lock-status') : null;
  client.emit('join-room', {
    roomId,
    user: { id, name: id, parentRoomId: roomId, isHost: claimHost },
    accessToken: issueRoomAccessToken({
      roomId,
      participantId: id,
      displayName: id,
      role,
    }),
  });
  if (lockStatus) client.initialRoomLockStatus = await lockStatus;
  return client;
}

test('meeting feature API persists schedules, agendas, notes, polls, questions, and breakouts in memory', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/features', featureRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/features`;
  const request = async (path, method = 'GET', body, participantId = 'test-host', role = 'host') => {
    const roomId = path.match(/\/(?:rooms|schedules)\/([^/]+)/)?.[1];
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(roomId ? {
          'X-Room-Access-Token': issueRoomAccessToken({
            roomId: decodeURIComponent(roomId),
            participantId,
            displayName: role === 'host' ? 'Test Host' : 'Test Participant',
            role,
          }),
        } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };

  try {
    const templates = await request('/templates');
    assert.equal(templates.status, 200);
    assert(templates.data.templates.some((template) => template.id === 'standup'));

    const scheduled = await request('/schedules', 'POST', {
      title: 'Feature test meeting',
      startsAt: new Date(Date.now() + 3_600_000).toISOString(),
      timeZone: 'Asia/Kolkata',
      durationMinutes: 30,
      invitees: ['private@example.com'],
      agenda: [{ id: 'agenda-1', text: 'Review the release' }],
    });
    assert.equal(scheduled.status, 201);
    assert.equal(Object.hasOwn(scheduled.data.meeting, 'invitees'), false);
    const { roomId } = scheduled.data.meeting;
    assert.equal((await request(`/schedules/${roomId}`)).data.meeting.title, 'Feature test meeting');

    const agenda = [{ id: 'agenda-1', text: 'Review the release', isCompleted: true }];
    assert.deepEqual((await request(`/rooms/${roomId}/agenda`, 'PUT', { agenda })).data.agenda, agenda);
    assert.deepEqual((await request(`/rooms/${roomId}/agenda`)).data.agenda, agenda);
    assert.equal((await request(`/rooms/${roomId}/agenda`, 'PUT', {
      agenda: [{ id: 'duplicate', text: 'First' }, { id: 'duplicate', text: 'Second' }],
    })).status, 400);
    assert.equal((await request(`/rooms/${roomId}/agenda`, 'PUT', {
      agenda: [{ id: 'invalid', text: 'Invalid completion state', isCompleted: 'false' }],
    })).status, 400);
    assert.deepEqual((await request(`/rooms/${roomId}/agenda`, 'PUT', { agenda: [] })).data.agenda, []);
    assert.deepEqual((await request(`/rooms/${roomId}/agenda`)).data.agenda, []);

    const notes = {
      summary: 'Release review',
      decisions: ['Proceed'],
      actionItems: [{ task: 'Publish notes', assignee: 'Test user', priority: 'High', isCompleted: true }],
      openQuestions: ['What is the rollout date?'],
    };
    assert.equal((await request(`/rooms/${roomId}/notes`, 'PUT', notes)).status, 200);
    assert.equal((await request(`/rooms/${roomId}/notes`)).data.notes.actionItems[0].isCompleted, true);
    assert.equal((await request(`/rooms/${roomId}/notes`, 'PUT', {
      ...notes,
      actionItems: [{ id: 'duplicate', task: 'First' }, { id: 'duplicate', task: 'Second' }],
    })).status, 400);
    assert.equal((await request(`/rooms/${roomId}/notes`, 'PUT', {
      ...notes,
      actionItems: [{ id: 'invalid', task: 'Invalid completion state', isCompleted: 'false' }],
    })).status, 400);
    const updatedNotes = { ...notes, summary: 'Updated release review', actionItems: [] };
    assert.equal((await request(`/rooms/${roomId}/notes`, 'PUT', updatedNotes)).status, 200);
    assert.equal((await request(`/rooms/${roomId}/notes`)).data.notes.summary, 'Updated release review');
    assert.deepEqual((await request(`/rooms/${roomId}/notes`)).data.notes.actionItems, []);

    assert.equal((await request(`/rooms/${roomId}/polls`, 'POST', {
      question: ' ',
      options: ['Yes', 'No'],
    })).status, 400);
    assert.equal((await request(`/rooms/${roomId}/polls`, 'POST', {
      question: 'q'.repeat(301),
      options: ['Yes', 'No'],
    })).status, 400);
    assert.equal((await request(`/rooms/${roomId}/polls`, 'POST', {
      question: 'Option too long',
      options: ['x'.repeat(121), 'No'],
    })).status, 400);
    assert.equal((await request(`/rooms/${roomId}/polls`, 'POST', {
      question: 'Too few options',
      options: ['Yes'],
    })).status, 400);
    assert.equal((await request(`/rooms/${roomId}/polls`, 'POST', {
      question: 'Duplicate options',
      options: ['Yes', 'yes'],
    })).status, 400);
    assert.equal((await request(`/rooms/${roomId}/polls`, 'POST', {
      question: 'Invalid multiple choice flag',
      options: ['Yes', 'No'],
      allowMultiple: 'true',
    })).status, 400);

    const pollResponse = await request(`/rooms/${roomId}/polls`, 'POST', {
      question: 'Ready to release?',
      options: ['Yes', 'No'],
    });
    assert.equal(pollResponse.status, 201);
    const poll = pollResponse.data.poll;
    assert((await request(`/rooms/${roomId}/polls`)).data.polls.some((item) => item.id === poll.id));
    assert.equal((await request(`/rooms/${roomId}/polls`, 'POST', {
      question: 'Too many options',
      options: Array.from({ length: 9 }, (_, index) => `Option ${index + 1}`),
    })).status, 400);
    const voted = await request(`/rooms/${roomId}/polls/${poll.id}/votes`, 'POST', {
      voterId: 'test-voter',
      optionIds: [poll.options[0].id],
    });
    assert.deepEqual(voted.data.poll.options[0].voters, ['test-host']);
    const repeatedVote = await request(`/rooms/${roomId}/polls/${poll.id}/votes`, 'POST', {
      voterId: 'another-voter',
      optionIds: [poll.options[0].id],
    });
    assert.deepEqual(repeatedVote.data.poll.options[0].voters, ['test-host']);
    assert.equal((await request(`/rooms/${roomId}/polls/${poll.id}/close`, 'PATCH')).status, 200);
    assert.equal((await request(`/rooms/${roomId}/polls/${poll.id}/votes`, 'POST', {
      voterId: 'late-voter',
      optionIds: [poll.options[1].id],
    })).status, 409);

    assert.equal((await request(`/rooms/${roomId}/questions`, 'POST', { text: '  ' })).status, 400);
    assert.equal((await request(`/rooms/${roomId}/questions`, 'POST', { text: 'q'.repeat(1001) })).status, 400);
    const questionResponse = await request(`/rooms/${roomId}/questions`, 'POST', {
      text: 'When will rollout begin?',
      authorId: 'test-voter',
      authorName: 'Test voter',
    });
    assert.equal(questionResponse.status, 201);
    assert.equal(questionResponse.data.question.authorId, 'test-host');
    assert.equal(questionResponse.data.question.authorName, 'Test Host');
    const questionId = questionResponse.data.question.id;
    assert((await request(`/rooms/${roomId}/questions`)).data.questions.some((item) => item.id === questionId));
    const upvote = await request(`/rooms/${roomId}/questions/${questionId}/upvote`, 'POST', {
      voterId: 'another-voter',
    });
    assert.deepEqual(upvote.data.question.upvoterIds, ['test-host']);
    const removedUpvote = await request(`/rooms/${roomId}/questions/${questionId}/upvote`, 'POST', {
      voterId: 'test-voter',
    });
    assert.deepEqual(removedUpvote.data.question.upvoterIds, []);
    assert.equal((await request(`/rooms/${roomId}/questions/${questionId}/answer`, 'PATCH', {}, 'test-participant', 'participant')).status, 403);
    assert.equal((await request(`/rooms/${roomId}/questions/${questionId}/answer`, 'PATCH')).data.question.status, 'answered');
    assert.equal((await request(`/rooms/${roomId}/questions/unknown-question/answer`, 'PATCH')).status, 404);

    const expiredBeforeCreate = {
      id: 'expired-before-create',
      roomId,
      status: 'active',
      groups: [],
      endsAt: new Date(Date.now() - 1_000),
    };
    breakoutSessions.set(roomId, [expiredBeforeCreate]);
    const breakout = await request(`/rooms/${roomId}/breakouts`, 'POST', {
      endsAt: new Date(Date.now() + 300_000).toISOString(),
      groups: [
        { id: 'group-1', name: 'Room 1', participantIds: ['participant-1'] },
        { id: 'group-2', name: 'Room 2', participantIds: ['participant-2'] },
      ],
    });
    assert.equal(breakout.status, 201);
    assert.equal(expiredBeforeCreate.status, 'ended');
    assert.equal((await request(`/rooms/${roomId}/breakouts`, 'POST', {
      groups: [
        { id: 'same', name: 'Room 1', participantIds: [] },
        { id: 'same', name: 'Room 2', participantIds: [] },
      ],
    })).status, 400);
    assert.equal((await request(`/rooms/${roomId}/breakouts`, 'POST', {
      groups: [
        { name: 'Room 1', participantIds: [] },
        { name: 'Room 2', participantIds: [] },
      ],
    })).status, 409);
    assert.equal((await request(`/rooms/${roomId}/breakouts`)).data.breakout.id, breakout.data.breakout.id);
    assert.equal((await request(`/rooms/${roomId}/breakouts/${breakout.data.breakout.id}/end`, 'PATCH')).status, 200);
    const expiredAfterRestart = {
      id: 'expired-after-restart',
      roomId,
      status: 'active',
      groups: [],
      endsAt: new Date(Date.now() - 1_000),
    };
    breakoutSessions.set(roomId, [expiredAfterRestart]);
    assert.equal((await request(`/rooms/${roomId}/breakouts`)).data.breakout, null);
    assert.equal(expiredAfterRestart.status, 'ended');

    assert.equal((await request(`/schedules/${roomId}`, 'DELETE')).status, 200);
    assert.equal((await request('/schedules')).data.meetings.length, 0);
    assert.equal((await request('/schedules', 'POST', { title: '', startsAt: new Date().toISOString() })).status, 400);
  } finally {
    await closeHttpServer(server);
  }
});

test('new guest-hosted rooms default to locked and make participants request admission', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/rooms', roomRoutes);
  const server = http.createServer(app);
  await listen(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  let roomId;

  try {
    const createResponse = await fetch(`${base}/api/rooms/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Locked by default', hostName: 'Host' }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    roomId = created.room.roomId;
    assert.equal(created.room.isLocked, true);

    const stateResponse = await fetch(`${base}/api/rooms/${roomId}/state`, {
      headers: { 'X-Room-Access-Token': created.accessToken },
    });
    assert.equal(stateResponse.status, 200);
    assert.equal((await stateResponse.json()).state.isLocked, true);

    const joinResponse = await fetch(`${base}/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Participant' }),
    });
    assert.equal(joinResponse.status, 200);
    assert.equal((await joinResponse.json()).requiresAdmission, true);

    const invalidLockSetting = await fetch(`${base}/api/rooms/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isLocked: 'false' }),
    });
    assert.equal(invalidLockSetting.status, 400);
  } finally {
    if (roomId) inMemoryRooms.delete(roomId);
    await closeHttpServer(server);
  }
});

test('authenticated room creation never reactivates an existing room ID', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/rooms', roomRoutes);
  const server = http.createServer(app);
  await listen(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const roomId = `ended-room-${Date.now()}`;
  let createdRoomId;
  const existingRoom = {
    roomId,
    hostId: 'room-owner',
    title: 'Previous meeting',
    isActive: false,
    endedAt: new Date(),
    attendeeIds: ['previous-attendee'],
    participants: [{ userId: 'previous-participant', isMuted: true }],
  };
  inMemoryRooms.set(roomId, existingRoom);

  const createRoom = (accountId, body) => fetch(`${base}/api/rooms/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken({ id: accountId, name: accountId })}`,
    },
    body: JSON.stringify(body),
  });

  try {
    const sameOwnerReuse = await createRoom('room-owner', { roomId, title: 'New meeting' });
    assert.equal(sameOwnerReuse.status, 409);
    assert.strictEqual(inMemoryRooms.get(roomId), existingRoom);
    assert.equal(existingRoom.isActive, false);
    assert.equal(existingRoom.title, 'Previous meeting');
    assert.equal(existingRoom.participants[0].userId, 'previous-participant');

    const differentOwnerReuse = await createRoom('different-owner', { roomId });
    assert.equal(differentOwnerReuse.status, 409);

    const invalidRoomId = await createRoom('room-owner', { roomId: '   ' });
    assert.equal(invalidRoomId.status, 400);

    const createdResponse = await createRoom('room-owner', { title: 'Fresh meeting' });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    createdRoomId = created.room.roomId;
    assert.equal(created.room.title, 'Fresh meeting');
    assert.equal(created.room.isLocked, true, 'new authenticated rooms should start locked by default');
    const hostAccess = verifyRoomAccessToken(created.accessToken, createdRoomId);
    assert.equal(hostAccess.role, 'host');
    assert.equal(hostAccess.accountId, 'room-owner');
  } finally {
    inMemoryRooms.delete(roomId);
    if (createdRoomId) inMemoryRooms.delete(createdRoomId);
    await closeHttpServer(server);
  }
});

test('room tickets are issued by the backend and required for feature API access', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/rooms', roomRoutes);
  app.use('/api/features', featureRoutes);
  app.use('/api/history', historyRoutes);
  const server = http.createServer(app);
  const io = new Server(server);
  setupSocketHandlers(io);
  await listen(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  let createdRoomId;
  let attendeeSocket;
  let endedWithoutArchiveId;
  try {
    const accountToken = generateToken({ id: 'account-owner', name: 'Account Owner' });
    const createdResponse = await fetch(`${base}/api/rooms/guest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountToken}`,
      },
      body: JSON.stringify({ title: 'Ticket test', hostName: 'Ticket Host', isLocked: false }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    const roomId = created.room.roomId;
    createdRoomId = roomId;
    const hostAccess = created.accessToken;
    assert.equal(created.room.hostId, 'account-owner');

    const joinResponse = await fetch(`${base}/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ticket Participant' }),
    });
    assert.equal(joinResponse.status, 200);
    const participantJoin = await joinResponse.json();
    const participantAccess = participantJoin.accessToken;
    assert.equal(participantJoin.role, 'participant');
    const attendeeToken = generateToken({ id: 'meeting-attendee', name: 'Meeting Attendee' });
    const attendeeJoinResponse = await fetch(`${base}/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${attendeeToken}`,
      },
      body: JSON.stringify({ name: 'Meeting Attendee' }),
    });
    const attendeeJoin = await attendeeJoinResponse.json();
    assert.equal(attendeeJoinResponse.status, 200);
    const ownerJoinResponse = await fetch(`${base}/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountToken}`,
      },
      body: JSON.stringify({ name: 'Account Owner' }),
    });
    assert.equal((await ownerJoinResponse.json()).role, 'host');
    const accountAccess = verifyRoomAccessToken(attendeeJoin.accessToken, roomId);
    assert.equal(accountAccess.accountId, 'meeting-attendee');
    Object.assign(inMemoryRooms.get(roomId), {
      attendeeIds: ['meeting-attendee'],
      admittedParticipantIds: ['private-admission-id'],
      participants: [{
        userId: 'private-participant-id',
        name: 'Private Participant',
        socketId: 'private-socket-id',
        isMuted: false,
        isVideoOff: false,
      }],
    });
    const roomDetailsResponse = await fetch(`${base}/api/rooms/${roomId}`, {
      headers: { 'X-Room-Access-Token': participantAccess },
    });
    const roomDetails = await roomDetailsResponse.json();
    assert.equal(roomDetailsResponse.status, 200);
    assert.deepEqual(
      Object.keys(roomDetails.room).sort(),
      ['agenda', 'createdAt', 'hostName', 'isActive', 'isLocked', 'roomId', 'settings', 'title']
    );
    assert.equal(JSON.stringify(roomDetails).includes('private-participant-id'), false);
    assert.equal(JSON.stringify(roomDetails).includes('private-admission-id'), false);
    const noRoomAccessResponse = await fetch(`${base}/api/rooms/${roomId}`);
    assert.equal(noRoomAccessResponse.status, 401, 'room details must require a room ticket');
    const crossRoomAccess = issueRoomAccessToken({
      roomId: `${roomId}-other`,
      participantId: 'cross-room-user',
      displayName: 'Cross Room User',
      role: 'participant',
    });
    const crossRoomDetailsResponse = await fetch(`${base}/api/rooms/${roomId}`, {
      headers: { 'X-Room-Access-Token': crossRoomAccess },
    });
    assert.equal(crossRoomDetailsResponse.status, 401, 'room details must reject tickets issued for another room');

    const noToken = await fetch(`${base}/api/features/rooms/${roomId}/notes`);
    assert.equal(noToken.status, 401);
    const participantNotes = await fetch(`${base}/api/features/rooms/${roomId}/notes`, {
      headers: { 'X-Room-Access-Token': participantAccess },
    });
    assert.equal(participantNotes.status, 200);
    attendeeSocket = createClient(base, { transports: ['websocket'], reconnection: false });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out connecting meeting attendee')), 3000);
      attendeeSocket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      attendeeSocket.once('connect_error', reject);
    });
    const attendeeJoined = waitForEvent(attendeeSocket, 'room-peers');
    attendeeSocket.emit('join-room', {
      roomId,
      user: { id: 'meeting-attendee', name: 'Meeting Attendee', parentRoomId: roomId },
      accessToken: attendeeJoin.accessToken,
    });
    await attendeeJoined;
    assert.deepEqual(inMemoryRooms.get(roomId).attendeeIds, ['meeting-attendee']);
    const attendeeRecord = [...inMemoryMeetingAttendance.values()].find(
      ({ roomId: attendanceRoomId, userId }) => attendanceRoomId === roomId && userId === 'meeting-attendee'
    );
    assert.equal(attendeeRecord.role, 'participant');

    const restoredRoomId = `restored-${Date.now()}`;
    const restoredAccess = issueRoomAccessToken({
      roomId: restoredRoomId,
      participantId: 'restored-host',
      displayName: 'Restored Host',
      role: 'host',
    });
    const restoredPolls = await fetch(`${base}/api/features/rooms/${restoredRoomId}/polls`, {
      headers: { 'X-Room-Access-Token': restoredAccess },
    });
    assert.equal(restoredPolls.status, 200, 'valid tickets should still access feature routes after process-local room metadata is lost');
    assert.deepEqual((await restoredPolls.json()).polls, []);

    const endedRoomId = `ended-${Date.now()}`;
    inMemoryRooms.set(endedRoomId, { roomId: endedRoomId, isActive: false });
    const endedAccess = issueRoomAccessToken({
      roomId: endedRoomId,
      participantId: 'ended-host',
      displayName: 'Ended Host',
      role: 'host',
    });
    const endedFeatureRequest = await fetch(`${base}/api/features/rooms/${endedRoomId}/polls`, {
      headers: { 'X-Room-Access-Token': endedAccess },
    });
    assert.equal(endedFeatureRequest.status, 404, 'inactive rooms must not be restored through an old ticket');
    inMemoryRooms.delete(endedRoomId);

    const hostOnlyAction = await fetch(`${base}/api/features/rooms/${roomId}/breakouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Room-Access-Token': participantAccess },
      body: JSON.stringify({ groups: [{ name: 'A', participantIds: [] }, { name: 'B', participantIds: [] }] }),
    });
    assert.equal(hostOnlyAction.status, 403);
    const hostAction = await fetch(`${base}/api/features/rooms/${roomId}/breakouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Room-Access-Token': hostAccess },
      body: JSON.stringify({ groups: [{ name: 'A', participantIds: [] }, { name: 'B', participantIds: [] }] }),
    });
    assert.equal(hostAction.status, 201);

    Object.assign(inMemoryRooms.get(roomId), { isActive: false, endedAt: new Date() });
    const archivePayload = {
      transcripts: [{ speaker: 'Ticket Host', text: 'We agreed to ship', timestamp: '00:01' }],
      aiNotes: { summary: 'Release planning', decisions: [], actionItems: [], openQuestions: [] },
    };
    const invalidArchive = await fetch(`${base}/api/history/${roomId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Room-Access-Token': hostAccess },
      body: JSON.stringify({ transcripts: [{ speaker: 'Host', text: 'x'.repeat(10_001), timestamp: '00:01' }] }),
    });
    assert.equal(invalidArchive.status, 400);
    const forbiddenArchive = await fetch(`${base}/api/history/${roomId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Room-Access-Token': participantAccess },
      body: JSON.stringify(archivePayload),
    });
    assert.equal(forbiddenArchive.status, 403);
    const savedArchive = await fetch(`${base}/api/history/${roomId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Room-Access-Token': hostAccess },
      body: JSON.stringify(archivePayload),
    });
    assert.equal(savedArchive.status, 201);
    assert.equal((await savedArchive.json()).storage, 'memory');
    const privateArchive = await fetch(`${base}/api/history/${roomId}`);
    assert.equal(privateArchive.status, 401);
    const loadedArchive = await fetch(`${base}/api/history/${roomId}`, {
      headers: { 'X-Room-Access-Token': hostAccess },
    });
    assert.equal(loadedArchive.status, 200);
    assert.equal((await loadedArchive.json()).record.transcripts.length, 1);
    const accountHistoryToken = generateToken({ id: 'account-owner', name: 'Account Owner' });
    const accountArchive = await fetch(`${base}/api/history/account/${roomId}`, {
      headers: { Authorization: `Bearer ${accountHistoryToken}` },
    });
    assert.equal(accountArchive.status, 200);
    const accountArchiveData = await accountArchive.json();
    assert.equal(accountArchiveData.record.transcripts.length, 1);
    assert.equal(accountArchiveData.record.aiNotes.summary, 'Release planning');
    assert.equal(Object.hasOwn(accountArchiveData.record, 'hostId'), false);
    const anonymousAccountArchive = await fetch(`${base}/api/history/account/${roomId}`);
    assert.equal(anonymousAccountArchive.status, 401);
    const unrelatedAccountArchive = await fetch(`${base}/api/history/account/${roomId}`, {
      headers: { Authorization: `Bearer ${generateToken({ id: 'different-account' })}` },
    });
    assert.equal(unrelatedAccountArchive.status, 404, 'an unrelated account cannot read the archive');
    const crossRoomArchive = await fetch(`${base}/api/history/${roomId}`, {
      headers: { 'X-Room-Access-Token': crossRoomAccess },
    });
    assert.equal(crossRoomArchive.status, 401);
    const participantArchive = await fetch(`${base}/api/history/${roomId}`, {
      headers: { 'X-Room-Access-Token': participantAccess },
    });
    assert.equal(participantArchive.status, 200, 'a meeting participant can read the archive after the room ends');
    attendeeSocket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert(attendeeRecord.leftAt instanceof Date);
    const memberAccountArchive = await fetch(`${base}/api/history/account/${roomId}`, {
      headers: { Authorization: `Bearer ${generateToken({ id: 'meeting-attendee' })}` },
    });
    assert.equal(memberAccountArchive.status, 200, 'recorded meeting attendees can read their account archive');
    const activeRecentMeetings = await fetch(`${base}/api/history/recent`, {
      headers: { Authorization: `Bearer ${accountToken}` },
    });
    assert.deepEqual(
      (await activeRecentMeetings.json()).meetings.map(({ roomId: recentRoomId }) => recentRoomId),
      [roomId]
    );
    const endedAt = new Date();
    endedWithoutArchiveId = `ended-without-archive-${Date.now()}`;
    inMemoryRooms.set(endedWithoutArchiveId, {
      roomId: endedWithoutArchiveId,
      title: 'Completed attendee meeting',
      hostId: 'someone-else',
      hostName: 'Other Host',
      attendeeIds: ['meeting-attendee'],
      isActive: false,
      endedAt,
      createdAt: new Date(endedAt.getTime() - 60_000),
    });
    const recentMeetings = await fetch(`${base}/api/history/recent`, {
      headers: { Authorization: `Bearer ${accountToken}` },
    });
    assert.equal(recentMeetings.status, 200);
    const recentData = await recentMeetings.json();
    assert.equal(recentData.meetings.length, 1);
    assert.equal(recentData.meetings[0].roomId, roomId);
    assert.equal(recentData.meetings[0].transcriptCount, 1);
    const attendeeHistory = await fetch(`${base}/api/history/recent`, {
      headers: { Authorization: `Bearer ${attendeeToken}` },
    });
    const attendeeHistoryMeetings = (await attendeeHistory.json()).meetings;
    assert.deepEqual(
      new Set(attendeeHistoryMeetings.map(({ roomId: recentRoomId }) => recentRoomId)),
      new Set([roomId, endedWithoutArchiveId])
    );
    assert.equal(attendeeHistoryMeetings.find(({ roomId: recentRoomId }) => recentRoomId === endedWithoutArchiveId).transcriptCount, 0);
    const otherAccount = await fetch(`${base}/api/history/recent`, {
      headers: { Authorization: `Bearer ${generateToken({ id: 'different-account' })}` },
    });
    assert.deepEqual((await otherAccount.json()).meetings, []);
  } finally {
    attendeeSocket?.disconnect();
    if (createdRoomId) {
      inMemoryRooms.delete(createdRoomId);
      inMemoryHistory.delete(createdRoomId);
      for (const [key, record] of inMemoryMeetingAttendance) {
        if (record.roomId === createdRoomId && record.userId === 'meeting-attendee') {
          inMemoryMeetingAttendance.delete(key);
        }
      }
    }
    if (endedWithoutArchiveId) inMemoryRooms.delete(endedWithoutArchiveId);
    await new Promise((resolve) => io.close(resolve));
  }
});

test('AI endpoints validate transcript size and reject malformed provider output', async () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/ai', aiRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/ai`;
  const roomId = `ai-room-${Date.now()}`;
  const otherRoomId = `${roomId}-other`;
  const roomAccessToken = issueRoomAccessToken({
    roomId,
    participantId: 'ai-guest',
    displayName: 'AI Guest',
    role: 'participant',
  });
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  inMemoryRooms.set(roomId, {
    roomId,
    isLocked: false,
    isActive: true,
    admittedParticipantIds: [],
  });

  try {
    process.env.GEMINI_API_KEY = 'test-key';
    let providerCalled = false;
    globalThis.fetch = async (url, options) => {
      if (url.startsWith(base)) return previousFetch(url, options);
      providerCalled = true;
      const body = JSON.parse(options.body);
      assert.ok(body.systemInstruction);
      const responseText = body.contents[0].parts[0].text.includes('\n\nQUESTION:\n')
        ? 'AI answer'
        : JSON.stringify({
          summary: 'Summary',
          decisions: ['Decision'],
          actionItems: [{ task: 'Do it', assignee: 'Host', priority: 'High' }],
          openQuestions: [],
        });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: responseText }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const anonymous = await fetch(`${base}/rooms/${roomId}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcripts: [{ text: 'Please summarize' }] }),
    });
    assert.equal(anonymous.status, 401);
    assert.equal(providerCalled, false);

    const crossRoom = await fetch(`${base}/rooms/${otherRoomId}/summarize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Room-Access-Token': roomAccessToken,
      },
      body: JSON.stringify({ transcripts: [{ text: 'Please summarize' }] }),
    });
    assert.equal(crossRoom.status, 401);
    assert.equal(providerCalled, false);

    const authorizedHeaders = {
      'Content-Type': 'application/json',
      'X-Room-Access-Token': roomAccessToken,
    };
    const oversized = await fetch(`${base}/rooms/${roomId}/summarize`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({ transcripts: [{ text: 'x'.repeat(120_001) }] }),
    });
    assert.equal(oversized.status, 400);
    assert.equal(providerCalled, false);

    const valid = await fetch(`${base}/rooms/${roomId}/summarize`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({ transcripts: [{ text: 'We agreed to proceed' }] }),
    });
    assert.equal(valid.status, 200);
    const validBody = await valid.json();
    assert.equal(validBody.source, 'gemini_api');
    assert.equal(validBody.data.actionItems[0].priority, 'High');

    const unauthorizedQuestion = await fetch(`${base}/rooms/${roomId}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What was decided?' }),
    });
    assert.equal(unauthorizedQuestion.status, 401);

    const answer = await fetch(`${base}/rooms/${roomId}/ask`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({
        transcripts: [{ text: 'We agreed to proceed' }],
        question: 'What was decided?',
      }),
    });
    assert.equal(answer.status, 200);
    assert.equal((await answer.json()).data, 'AI answer');

    globalThis.fetch = async (url, options) => (
      url.startsWith(base)
        ? previousFetch(url, options)
        : new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"summary":"incomplete"}' }] } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const malformed = await fetch(`${base}/rooms/${roomId}/summarize`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({ transcripts: [{ text: 'Please summarize' }] }),
    });
    assert.equal(malformed.status, 502);
    assert.equal((await malformed.json()).success, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
    inMemoryRooms.delete(roomId);
    await closeHttpServer(server);
  }
});

test('breakout groups stay isolated and return on host request or timer expiry', async () => {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  setupSocketHandlers(io);
  await listen(httpServer);
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = [];
  inMemoryRooms.set('meeting-under-test', {
    roomId: 'meeting-under-test',
    hostId: 'host-user',
    hostName: 'host-user',
    isLocked: false,
    admittedParticipantIds: [],
    isActive: true,
  });

  try {
    const host = await connectParticipant(url, 'host-user', 'host');
    clients.push(host);
    const alice = await connectParticipant(url, 'alice-user', 'participant', true);
    clients.push(alice);
    const bob = await connectParticipant(url, 'bob-user');
    clients.push(bob);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const isActive = (breakoutId) => (assignment) => assignment.breakoutId === breakoutId && assignment.active;
    const isReturned = (breakoutId) => (assignment) => assignment.breakoutId === breakoutId && !assignment.active;
    const manualId = `manual-${Date.now()}`;
    breakoutSessions.set('meeting-under-test', [{
      id: manualId,
      roomId: 'meeting-under-test',
      status: 'active',
      endsAt: new Date(Date.now() + 30_000).toISOString(),
      groups: [
        { id: 'group-1', name: 'Room 1', participantIds: ['alice-user'] },
        { id: 'group-2', name: 'Room 2', participantIds: ['bob-user'] },
      ],
    }]);
    const aliceMoved = waitForEvent(alice, 'breakout-assignment', isActive(manualId));
    const bobMoved = waitForEvent(bob, 'breakout-assignment', isActive(manualId));
    host.emit('start-breakout', {
      breakout: {
        id: manualId,
        endsAt: new Date(Date.now() + 30_000).toISOString(),
        groups: [
          { id: 'group-1', participantIds: ['alice-user'] },
          { id: 'group-2', participantIds: ['bob-user'] },
        ],
      },
    });
    const [aliceAssignment, bobAssignment] = await Promise.all([aliceMoved, bobMoved]);
    assert.notEqual(aliceAssignment.roomId, bobAssignment.roomId);
    roomPolls.set('meeting-under-test', [{
      id: 'persisted-poll',
      roomId: 'meeting-under-test',
      question: 'Canonical question',
      options: [],
      status: 'open',
    }]);
    const persistedPollBroadcast = waitForEvent(bob, 'meeting-poll-updated');
    alice.emit('meeting-poll-updated', {
      id: 'persisted-poll',
      roomId: 'meeting-under-test',
      question: 'Forged client data',
    });
    assert.equal((await persistedPollBroadcast).poll.question, 'Canonical question');
    const spoofedHostCommand = waitForEvent(host, 'host-mute-all-command', undefined, 200)
      .then(() => true, () => false);
    alice.emit('host-mute-all');
    assert.equal(await spoofedHostCommand, false, 'a participant cannot gain host privileges with a client-supplied role');

    const bobReceivesAliceChat = waitForEvent(bob, 'receive-chat-message', undefined, 200)
      .then(() => true, () => false);
    const hostReceivesAliceChat = waitForEvent(host, 'receive-chat-message', undefined, 200)
      .then(() => true, () => false);
    alice.emit('send-chat-message', { text: 'breakout-only' });
    assert.equal(await bobReceivesAliceChat, false);
    assert.equal(await hostReceivesAliceChat, false);

    const aliceReturned = waitForEvent(alice, 'breakout-assignment', isReturned(manualId));
    const bobReturned = waitForEvent(bob, 'breakout-assignment', isReturned(manualId));
    host.emit('end-breakout', { breakoutId: manualId });
    await Promise.all([aliceReturned, bobReturned]);

    const timedId = `timed-${Date.now()}`;
    breakoutSessions.set('meeting-under-test', [{
      id: timedId,
      roomId: 'meeting-under-test',
      status: 'active',
      endsAt: new Date(Date.now() + 500).toISOString(),
      groups: [
        { id: 'group-1', name: 'Room 1', participantIds: ['alice-user'] },
        { id: 'group-2', name: 'Room 2', participantIds: ['bob-user'] },
      ],
    }]);
    const aliceTimedActive = waitForEvent(alice, 'breakout-assignment', isActive(timedId));
    const bobTimedActive = waitForEvent(bob, 'breakout-assignment', isActive(timedId));
    const aliceTimedReturn = waitForEvent(alice, 'breakout-assignment', isReturned(timedId));
    const bobTimedReturn = waitForEvent(bob, 'breakout-assignment', isReturned(timedId));
    host.emit('start-breakout', {
      breakout: {
        id: timedId,
        endsAt: new Date(Date.now() + 500).toISOString(),
        groups: [
          { id: 'group-1', participantIds: ['alice-user'] },
          { id: 'group-2', participantIds: ['bob-user'] },
        ],
      },
    });
    await Promise.all([aliceTimedActive, bobTimedActive, aliceTimedReturn, bobTimedReturn]);
  } finally {
    for (const client of clients) client.disconnect();
    breakoutSessions.delete('meeting-under-test');
    roomPolls.delete('meeting-under-test');
    inMemoryRooms.delete('meeting-under-test');
    await new Promise((resolve) => io.close(resolve));
  }
});

test('a reloaded participant rejoins with a new socket and still sees existing peers', async () => {
  const roomId = `reload-${Date.now()}`;
  const server = http.createServer(express());
  const io = new Server(server);
  setupSocketHandlers(io);
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  inMemoryRooms.set(roomId, { roomId, hostId: 'reload-host', hostName: 'Host', isActive: true });
  const host = await connectParticipant(url, 'reload-host', 'host', false, roomId);
  const guest = await connectParticipant(url, 'reload-guest', 'participant', false, roomId);
  let reloaded;
  try {
    const muteCommand = waitForEvent(guest, 'host-mute-all-command');
    host.emit('host-mute-all');
    await muteCommand;
    const savedGuest = () => inMemoryRooms.get(roomId).participants.find(({ userId }) => userId === 'reload-guest');
    assert.equal(savedGuest().isMuted, true, 'host mute-all should persist participant mute state');

    guest.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(savedGuest().socketId, null, 'disconnect should retain media state while clearing the stale socket ID');
    const error = [];
    const peers = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('rejoin timed out')), 3000);
      reloaded = createClient(url, { transports: ['websocket'], reconnection: false });
      reloaded.on('room-join-error', (payload) => error.push(payload));
      reloaded.on('room-peers', (list) => { clearTimeout(timeout); resolve(list); });
      reloaded.on('connect', () => reloaded.emit('join-room', {
        roomId,
        user: { id: 'reload-guest', name: 'reload-guest', parentRoomId: roomId, isMuted: false },
        accessToken: issueRoomAccessToken({ roomId, participantId: 'reload-guest', displayName: 'reload-guest', role: 'participant' }),
      }));
    });
    const restoredMediaState = waitForEvent(reloaded, 'local-media-state');
    const list = await peers;
    assert.deepEqual(await restoredMediaState, { isMuted: true, isVideoOff: false });
    assert.deepEqual(error, []);
    assert.ok(list.peers.some((peer) => (peer.user?.id || peer.id) === 'reload-host'));
    assert.equal(inMemoryRooms.get(roomId).participants.length, 2, 'rejoin should update rather than duplicate participant state');
    assert.equal(
      inMemoryRooms.get(roomId).participants.find(({ userId }) => userId === 'reload-guest').socketId,
      reloaded.id
    );
  } finally {
    host.disconnect();
    reloaded?.disconnect();
    inMemoryRooms.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});

test('previous room participants can rejoin after locking, while intentional leave revokes access', async () => {
  const roomId = `locked-rejoin-${Date.now()}`;
  const app = express();
  app.use(express.json());
  app.use('/api/rooms', roomRoutes);
  const server = http.createServer(app);
  const io = new Server(server);
  setupSocketHandlers(io);
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const room = {
    roomId,
    hostId: 'rejoin-host',
    hostName: 'Host',
    isLocked: false,
    admittedParticipantIds: [],
    participants: [],
    isActive: true,
  };
  inMemoryRooms.set(roomId, room);
  const host = await connectParticipant(url, 'rejoin-host', 'host', false, roomId);
  let guest;
  let reconnectedGuest;

  try {
    const ticketResponse = await fetch(`${url}/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Guest', participantId: 'rejoin-host' }),
    });
    assert.equal(ticketResponse.status, 200);
    const ticket = await ticketResponse.json();
    assert.notEqual(ticket.participant.id, 'rejoin-host');
    assert.match(ticket.participant.id, /^guest-/);

    const connectAndJoinGuest = async () => {
      const client = createClient(url, { transports: ['websocket'], reconnection: false });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out connecting rejoin guest')), 3000);
        client.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        client.once('connect_error', reject);
      });
      const joined = waitForEvent(client, 'room-peers');
      client.emit('join-room', {
        roomId,
        user: { id: ticket.participant.id, name: 'Guest', parentRoomId: roomId },
        accessToken: ticket.accessToken,
      });
      await joined;
      return client;
    };

    guest = await connectAndJoinGuest();
    assert.equal(room.participants.length, 2);
    const lockStatus = waitForEvent(guest, 'room-lock-status');
    host.emit('host-lock-room', { isLocked: true });
    assert.deepEqual(await lockStatus, { isLocked: true });

    const stateBeforeRefresh = await fetch(`${url}/api/rooms/${roomId}/state`, {
      headers: { 'X-Room-Access-Token': ticket.accessToken },
    });
    assert.equal(stateBeforeRefresh.status, 200);

    guest.disconnect();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const storedGuest = room.participants.find((participant) => participant.userId === ticket.participant.id);
      if (storedGuest?.socketId === null) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const disconnectedGuest = room.participants.find((participant) => participant.userId === ticket.participant.id);
    assert.equal(disconnectedGuest?.socketId, null);
    assert.equal(disconnectedGuest?.isDisconnected, true);
    const disconnectedState = await fetch(`${url}/api/rooms/${roomId}/state`, {
      headers: { 'X-Room-Access-Token': ticket.accessToken },
    });
    const disconnectedStateBody = await disconnectedState.json();
    assert.equal(disconnectedStateBody.state.participants.find(
      (participant) => participant.userId === ticket.participant.id
    )?.isDisconnected, true);

    reconnectedGuest = await connectAndJoinGuest();
    const rejoinedGuest = room.participants.filter((participant) => participant.userId === ticket.participant.id);
    assert.equal(rejoinedGuest.length, 1);
    assert.equal(rejoinedGuest[0].isDisconnected, false);

    reconnectedGuest.emit('leave-room');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (!room.participants.some((participant) => participant.userId === ticket.participant.id)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(room.participants.some((participant) => participant.userId === ticket.participant.id), false);
    const stateAfterLeave = await fetch(`${url}/api/rooms/${roomId}/state`, {
      headers: { 'X-Room-Access-Token': ticket.accessToken },
    });
    assert.equal(stateAfterLeave.status, 403);
  } finally {
    const ended = reconnectedGuest ? waitForEvent(reconnectedGuest, 'meeting-ended-by-host') : null;
    host.emit('host-end-meeting');
    if (ended) await ended;
    guest?.disconnect();
    reconnectedGuest?.disconnect();
    host.disconnect();
    inMemoryRooms.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});

test('locked rooms deny feature access until the host admits the participant', async () => {
  const roomId = `locked-${Date.now()}`;
  const app = express();
  app.use(express.json());
  app.use('/api/rooms', roomRoutes);
  app.use('/api/features', featureRoutes);
  const server = http.createServer(app);
  const io = new Server(server);
  setupSocketHandlers(io);
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const room = {
    roomId,
    hostId: 'locked-host',
    hostName: 'Host',
    isLocked: true,
    admittedParticipantIds: [],
    isActive: true,
  };
  inMemoryRooms.set(roomId, room);
  scheduledMeetings.set(roomId, { roomId, status: 'scheduled' });
  const host = await connectParticipant(url, 'locked-host', 'host', false, roomId);
  const participant = await connectParticipant(url, 'locked-guest', 'participant', false, roomId);

  try {
    assert.deepEqual(host.initialRoomLockStatus, { isLocked: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const participantAccess = issueRoomAccessToken({
      roomId,
      participantId: 'locked-guest',
      displayName: 'Guest',
      role: 'participant',
    });
    const beforeAdmission = await fetch(`${url}/api/features/rooms/${roomId}/notes`, {
      headers: { 'X-Room-Access-Token': participantAccess },
    });
    assert.equal(beforeAdmission.status, 403);

    const knockRequest = waitForEvent(host, 'knock-request');
    const knockResponse = waitForEvent(participant, 'knock-response');
    participant.emit('knock-room', {
      roomId,
      user: { name: 'Guest' },
      accessToken: participantAccess,
    });
    const request = await knockRequest;
    host.emit('admit-user', { applicantSocketId: request.applicantSocketId });
    assert.equal((await knockResponse).approved, true);

    const guestJoined = waitForEvent(participant, 'room-peers');
    participant.emit('join-room', {
      roomId,
      user: { id: 'locked-guest', name: 'Guest', parentRoomId: roomId },
      accessToken: participantAccess,
    });
    await guestJoined;
    const afterAdmission = await fetch(`${url}/api/features/rooms/${roomId}/notes`, {
      headers: { 'X-Room-Access-Token': participantAccess },
    });
    assert.equal(afterAdmission.status, 200);
    assert.deepEqual(room.admittedParticipantIds, ['locked-guest']);

    const ended = waitForEvent(participant, 'meeting-ended-by-host');
    host.emit('host-end-meeting');
    await ended;
    assert.equal(room.isActive, false);
    assert.equal(scheduledMeetings.get(roomId).status, 'ended');
    const deniedRejoin = await fetch(`${url}/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Late guest' }),
    });
    assert.equal(deniedRejoin.status, 404);
  } finally {
    host.disconnect();
    participant.disconnect();
    inMemoryRooms.delete(roomId);
    scheduledMeetings.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});
