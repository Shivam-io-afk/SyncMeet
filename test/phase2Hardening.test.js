import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { test } from 'node:test';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import authRoutes from '../server/routes/authRoutes.js';
import roomRoutes from '../server/routes/roomRoutes.js';
import featureRoutes from '../server/routes/meetingFeatureRoutes.js';
import historyRoutes from '../server/routes/historyRoutes.js';
import { issueRoomAccessToken } from '../server/middleware/roomAccessMiddleware.js';
import {
  inMemoryRooms,
  roomPolls,
  roomQuestions,
} from '../server/store/memoryMeetingStore.js';
import { setupSocketHandlers } from '../server/socket/socketHandler.js';

function startApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/features', featureRoutes);
  app.use('/api/history', historyRoutes);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  setupSocketHandlers(io, { disconnectGracePeriodMs: 50 });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        server,
        io,
        close: async () => {
          await new Promise((res) => io.close(res));
          await new Promise((res) => server.close(res));
        },
      });
    });
  });
}

function waitForEvent(socket, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for socket event: ${eventName}`));
    }, timeoutMs);
    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

test('DELETE /api/features/rooms/:roomId/questions/:questionId enforces author or host permissions', async () => {
  const appInstance = await startApp();
  const roomId = `q-perm-room-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    title: 'Question Permissions Room',
    hostId: 'host-user',
    hostName: 'Host User',
    isActive: true,
    isLocked: false,
    participants: [],
  });

  const hostToken = issueRoomAccessToken({
    roomId,
    participantId: 'host-user',
    displayName: 'Host User',
    role: 'host',
  });
  const authorToken = issueRoomAccessToken({
    roomId,
    participantId: 'author-user',
    displayName: 'Author User',
    role: 'participant',
  });
  const bystanderToken = issueRoomAccessToken({
    roomId,
    participantId: 'bystander-user',
    displayName: 'Bystander User',
    role: 'participant',
  });

  try {
    // 1. Author submits a question
    const postRes = await fetch(`${appInstance.baseUrl}/api/features/rooms/${roomId}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Room-Access-Token': authorToken,
      },
      body: JSON.stringify({ text: 'What is the deployment timeline?' }),
    });
    assert.equal(postRes.status, 201);
    const postData = await postRes.json();
    const questionId = postData.question.id;
    assert.ok(questionId);

    // 2. Bystander attempts to delete author's question -> 403 Forbidden
    const bystanderDelete = await fetch(`${appInstance.baseUrl}/api/features/rooms/${roomId}/questions/${questionId}`, {
      method: 'DELETE',
      headers: { 'X-Room-Access-Token': bystanderToken },
    });
    assert.equal(bystanderDelete.status, 403, 'A bystander cannot delete another user\'s question');

    // 3. Question author deletes their own question -> 200 OK
    const authorDelete = await fetch(`${appInstance.baseUrl}/api/features/rooms/${roomId}/questions/${questionId}`, {
      method: 'DELETE',
      headers: { 'X-Room-Access-Token': authorToken },
    });
    assert.equal(authorDelete.status, 200, 'Author can delete their own question');

    // 4. Submit a new question, then verify host can delete it
    const postRes2 = await fetch(`${appInstance.baseUrl}/api/features/rooms/${roomId}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Room-Access-Token': authorToken,
      },
      body: JSON.stringify({ text: 'Second question for host moderation' }),
    });
    const postData2 = await postRes2.json();
    const questionId2 = postData2.question.id;

    const hostDelete = await fetch(`${appInstance.baseUrl}/api/features/rooms/${roomId}/questions/${questionId2}`, {
      method: 'DELETE',
      headers: { 'X-Room-Access-Token': hostToken },
    });
    assert.equal(hostDelete.status, 200, 'Host can delete any participant\'s question');

    // 5. Deleting already deleted question -> 404
    const notFoundDelete = await fetch(`${appInstance.baseUrl}/api/features/rooms/${roomId}/questions/${questionId2}`, {
      method: 'DELETE',
      headers: { 'X-Room-Access-Token': hostToken },
    });
    assert.equal(notFoundDelete.status, 404);
  } finally {
    inMemoryRooms.delete(roomId);
    roomQuestions.delete(roomId);
    await appInstance.close();
  }
});

test('DELETE /api/features/rooms/:roomId/polls/:pollId restricts poll deletion strictly to the host', async () => {
  const appInstance = await startApp();
  const roomId = `poll-perm-room-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    title: 'Poll Permissions Room',
    hostId: 'host-user',
    hostName: 'Host User',
    isActive: true,
    isLocked: false,
    participants: [],
  });

  const hostToken = issueRoomAccessToken({
    roomId,
    participantId: 'host-user',
    displayName: 'Host User',
    role: 'host',
  });
  const participantToken = issueRoomAccessToken({
    roomId,
    participantId: 'regular-participant',
    displayName: 'Regular Participant',
    role: 'participant',
  });

  try {
    // 1. Create a poll
    const createRes = await fetch(`${appInstance.baseUrl}/api/features/rooms/${roomId}/polls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Room-Access-Token': hostToken,
      },
      body: JSON.stringify({
        question: 'Should we adopt TypeScript next sprint?',
        options: ['Yes', 'No', 'Need more info'],
      }),
    });
    assert.equal(createRes.status, 201);
    const pollData = await createRes.json();
    const pollId = pollData.poll.id;
    assert.ok(pollId);

    // 2. Non-host attempts to delete poll -> 403 Forbidden
    const participantDelete = await fetch(`${appInstance.baseUrl}/api/features/rooms/${roomId}/polls/${pollId}`, {
      method: 'DELETE',
      headers: { 'X-Room-Access-Token': participantToken },
    });
    assert.equal(participantDelete.status, 403, 'Participants cannot delete polls');

    // 3. Host deletes poll -> 200 OK
    const hostDelete = await fetch(`${appInstance.baseUrl}/api/features/rooms/${roomId}/polls/${pollId}`, {
      method: 'DELETE',
      headers: { 'X-Room-Access-Token': hostToken },
    });
    assert.equal(hostDelete.status, 200, 'Host can delete poll');

    // 4. Subsequent delete returns 404
    const notFoundDelete = await fetch(`${appInstance.baseUrl}/api/features/rooms/${roomId}/polls/${pollId}`, {
      method: 'DELETE',
      headers: { 'X-Room-Access-Token': hostToken },
    });
    assert.equal(notFoundDelete.status, 404);
  } finally {
    inMemoryRooms.delete(roomId);
    roomPolls.delete(roomId);
    await appInstance.close();
  }
});

test('Socket.io broadcasts meeting-question-deleted and meeting-poll-deleted to peers in the meeting', async () => {
  const appInstance = await startApp();
  const roomId = `socket-event-room-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    title: 'Socket Event Room',
    hostId: 'host-user',
    hostName: 'Host User',
    isActive: true,
    isLocked: false,
    participants: [],
  });

  const hostToken = issueRoomAccessToken({
    roomId,
    participantId: 'host-user',
    displayName: 'Host User',
    role: 'host',
  });
  const participantToken = issueRoomAccessToken({
    roomId,
    participantId: 'peer-user',
    displayName: 'Peer User',
    role: 'participant',
  });

  const hostClient = createClient(appInstance.baseUrl, { transports: ['websocket'], reconnection: false });
  const peerClient = createClient(appInstance.baseUrl, { transports: ['websocket'], reconnection: false });

  try {
    await Promise.all([
      new Promise((res) => hostClient.once('connect', res)),
      new Promise((res) => peerClient.once('connect', res)),
    ]);

    const hostJoined = waitForEvent(hostClient, 'room-peers');
    hostClient.emit('join-room', {
      roomId,
      user: { id: 'host-user', name: 'Host User' },
      accessToken: hostToken,
    });
    await hostJoined;

    const peerJoined = waitForEvent(peerClient, 'room-peers');
    peerClient.emit('join-room', {
      roomId,
      user: { id: 'peer-user', name: 'Peer User' },
      accessToken: participantToken,
    });
    await peerJoined;

    // Test question deleted broadcast
    const questionDeletedPromise = waitForEvent(peerClient, 'meeting-question-deleted');
    hostClient.emit('meeting-question-deleted', { questionId: 'q-12345' });
    const questionDeletedEvent = await questionDeletedPromise;
    assert.equal(questionDeletedEvent.questionId, 'q-12345');

    // Test poll deleted broadcast
    const pollDeletedPromise = waitForEvent(peerClient, 'meeting-poll-deleted');
    hostClient.emit('meeting-poll-deleted', { pollId: 'poll-67890' });
    const pollDeletedEvent = await pollDeletedPromise;
    assert.equal(pollDeletedEvent.pollId, 'poll-67890');
  } finally {
    hostClient.disconnect();
    peerClient.disconnect();
    inMemoryRooms.delete(roomId);
    await appInstance.close();
  }
});

