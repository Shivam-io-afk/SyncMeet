import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { test } from 'node:test';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import authRoutes from '../server/routes/authRoutes.js';
import roomRoutes from '../server/routes/roomRoutes.js';
import featureRoutes from '../server/routes/meetingFeatureRoutes.js';
import { issueRoomAccessToken } from '../server/middleware/roomAccessMiddleware.js';
import { inMemoryMeetingAttendance, inMemoryRooms } from '../server/store/memoryMeetingStore.js';
import { setupSocketHandlers } from '../server/socket/socketHandler.js';

function startApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/features', featureRoutes);
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve) => {
    server.once('listening', () => resolve({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done, reject) => {
        server.close((error) => error ? reject(error) : done());
      }),
    }));
  });
}

async function request(baseUrl, path, { method = 'GET', body, token, bearerToken } = {}) {
  const headers = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'X-Room-Access-Token': token } : {}),
    ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
  };
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, data: await response.json().catch(() => ({})) };
}

function waitForEvent(client, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for event "${event}" (${timeoutMs}ms)`));
    }, timeoutMs);
    client.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

test('POST /api/rooms/:roomId/join preserves stable userId for authenticated non-host participants', async () => {
  const app = await startApp();
  try {
    // 1. Register Host
    const hostEmail = `host_${Date.now()}@syncmeet.ai`;
    const regHost = await request(app.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Meeting Host', email: hostEmail, password: 'password123' },
    });
    assert.equal(regHost.response.status, 201);
    const hostToken = regHost.data.token;

    // 2. Host creates a room
    const roomId = `room-sync-${Date.now()}`;
    const createRes = await request(app.baseUrl, '/api/rooms/create', {
      method: 'POST',
      bearerToken: hostToken,
      body: { roomId, title: 'State Sync Room' },
    });
    assert.equal(createRes.response.status, 201);

    // 3. Register Participant (Alex)
    const alexEmail = `alex_${Date.now()}@syncmeet.ai`;
    const regAlex = await request(app.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Alex Chen', email: alexEmail, password: 'password123' },
    });
    assert.equal(regAlex.response.status, 201);
    const alexToken = regAlex.data.token;
    const alexUserId = regAlex.data.user.id;
    assert.ok(alexUserId, 'Alex must have a valid user ID');

    // 4. Alex joins the room as an authenticated participant
    const joinRes1 = await request(app.baseUrl, `/api/rooms/${roomId}/join`, {
      method: 'POST',
      bearerToken: alexToken,
      body: { name: 'Alex Chen' },
    });
    assert.equal(joinRes1.response.status, 200);
    assert.equal(joinRes1.data.role, 'participant');
    assert.equal(joinRes1.data.participant.id, alexUserId, 'Participant ID must match stable account ID');

    // 5. Alex reloads and joins again with same account
    const joinRes2 = await request(app.baseUrl, `/api/rooms/${roomId}/join`, {
      method: 'POST',
      bearerToken: alexToken,
      body: { name: 'Alex Chen' },
    });
    assert.equal(joinRes2.response.status, 200);
    assert.equal(joinRes2.data.participant.id, alexUserId, 'On rejoin, participant ID must remain identical to account ID');
  } finally {
    await app.close();
  }
});

test('GET /api/rooms/:roomId/state returns authoritative room state and rejects unauthorized requests', async () => {
  const app = await startApp();
  try {
    const roomId = `room-state-${Date.now()}`;
    inMemoryRooms.set(roomId, {
      roomId,
      title: 'State Test Room',
      hostId: 'host-123',
      hostName: 'Host 123',
      isLocked: false,
      isActive: true,
      createdAt: new Date(),
      agenda: [{ id: 'ag-1', title: 'Discuss Roadmap', isCompleted: false }],
      participants: [
        { userId: 'host-123', name: 'Host 123', isMuted: false, isVideoOff: false },
        { userId: 'user-456', name: 'User 456', isMuted: true, isVideoOff: false },
      ],
    });

    // 1. Missing token is rejected with 401
    const unauthRes = await request(app.baseUrl, `/api/rooms/${roomId}/state`);
    assert.equal(unauthRes.response.status, 401);

    // 2. Token for wrong room is rejected with 403
    const foreignToken = issueRoomAccessToken({
      roomId: 'other-room-xyz',
      participantId: 'user-456',
      role: 'participant',
      displayName: 'User 456',
    });
    const foreignRes = await request(app.baseUrl, `/api/rooms/${roomId}/state`, {
      token: foreignToken,
    });
    assert.equal(foreignRes.response.status, 401);

    // 3. Valid token retrieves complete room state
    const validToken = issueRoomAccessToken({
      roomId,
      participantId: 'user-456',
      role: 'participant',
      displayName: 'User 456',
    });
    const stateRes = await request(app.baseUrl, `/api/rooms/${roomId}/state`, {
      token: validToken,
    });
    assert.equal(stateRes.response.status, 200);
    assert.equal(stateRes.data.success, true);
    assert.equal(stateRes.data.state.roomId, roomId);
    assert.equal(stateRes.data.state.title, 'State Test Room');
    assert.equal(stateRes.data.state.caller.participantId, 'user-456');
    assert.equal(stateRes.data.state.caller.role, 'participant');
    assert.equal(stateRes.data.state.caller.isHost, false);
    assert.equal(stateRes.data.state.agenda.length, 1);
    assert.equal(stateRes.data.state.participants.length, 2);
  } finally {
    await app.close();
  }
});

test('Socket disconnect grace period suppresses instant user-left and emits user-reconnected on rejoin', async () => {
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: '*' } });
  // Use a fast 600ms grace period for the test
  setupSocketHandlers(io, { disconnectGracePeriodMs: 600 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socketUrl = `http://127.0.0.1:${server.address().port}`;

  const roomId = `grace-room-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    title: 'Grace Period Room',
    hostId: 'host-user',
    hostName: 'Host User',
    isLocked: false,
    isActive: true,
  });

  const hostToken = issueRoomAccessToken({
    roomId,
    participantId: 'host-user',
    role: 'host',
    displayName: 'Host User',
    accountId: 'host-user',
  });
  const participantToken = issueRoomAccessToken({
    roomId,
    participantId: 'participant-user',
    role: 'participant',
    displayName: 'Participant User',
    accountId: 'participant-user',
  });

  // 1. Host connects and joins
  const hostClient = createClient(socketUrl, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve) => hostClient.once('connect', resolve));
  const hostJoined = waitForEvent(hostClient, 'room-peers');
  hostClient.emit('join-room', {
    roomId,
    user: { id: 'host-user', name: 'Host User' },
    accessToken: hostToken,
  });
  await hostJoined;

  // 2. Participant connects and joins
  let participantClient = createClient(socketUrl, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve) => participantClient.once('connect', resolve));
  const userJoinedPromise = waitForEvent(hostClient, 'user-joined');
  participantClient.emit('join-room', {
    roomId,
    user: { id: 'participant-user', name: 'Participant User' },
    accessToken: participantToken,
  });
  await userJoinedPromise;

  try {
    // 3. Track if host receives user-left during grace period
    let receivedUserLeft = false;
    const userLeftHandler = () => { receivedUserLeft = true; };
    hostClient.on('user-left', userLeftHandler);

    // Track user-reconnected on host
    const userReconnectedPromise = waitForEvent(hostClient, 'user-reconnected');

    // 4. Participant socket abruptly disconnects (simulating browser reload)
    const oldParticipantSocketId = participantClient.id;
    participantClient.disconnect();

    // Wait 200ms (within the 600ms grace window)
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(receivedUserLeft, false, 'user-left must NOT be emitted immediately upon disconnect during grace period');

    // 5. Participant re-establishes socket connection within grace period
    participantClient = createClient(socketUrl, { transports: ['websocket'], reconnection: false });
    await new Promise((resolve) => participantClient.once('connect', resolve));
    assert.notEqual(participantClient.id, oldParticipantSocketId, 'New socket must have a new ID');

    const participantPeersPromise = waitForEvent(participantClient, 'room-peers');
    participantClient.emit('join-room', {
      roomId,
      user: { id: 'participant-user', name: 'Participant User' },
      accessToken: participantToken,
    });

    const reconnectedEvent = await userReconnectedPromise;
    assert.equal(reconnectedEvent.oldSocketId, oldParticipantSocketId);
    assert.equal(reconnectedEvent.newSocketId, participantClient.id);
    assert.equal(reconnectedEvent.user.id, 'participant-user');

    const peersData = await participantPeersPromise;
    assert.ok(peersData.peers.some((p) => p.user.id === 'host-user'), 'Rejoined user must receive existing room peers');

    // Still no user-left event emitted
    assert.equal(receivedUserLeft, false, 'user-left was never emitted because participant rejoined within grace period');

    hostClient.off('user-left', userLeftHandler);
  } finally {
    hostClient.disconnect();
    participantClient.disconnect();
    io.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Socket disconnect grace period emits user-left after expiry if user does not rejoin', async () => {
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: '*' } });
  // Fast 300ms grace period for expiry test
  setupSocketHandlers(io, { disconnectGracePeriodMs: 300 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socketUrl = `http://127.0.0.1:${server.address().port}`;

  const roomId = `expiry-room-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    title: 'Expiry Room',
    hostId: 'host-user',
    hostName: 'Host User',
    isLocked: false,
    isActive: true,
  });

  const hostToken = issueRoomAccessToken({
    roomId,
    participantId: 'host-user',
    role: 'host',
    displayName: 'Host User',
  });
  const participantToken = issueRoomAccessToken({
    roomId,
    participantId: 'expiring-user',
    role: 'participant',
    displayName: 'Expiring User',
  });

  const hostClient = createClient(socketUrl, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve) => hostClient.once('connect', resolve));
  const hostJoined = waitForEvent(hostClient, 'room-peers');
  hostClient.emit('join-room', {
    roomId,
    user: { id: 'host-user', name: 'Host User' },
    accessToken: hostToken,
  });
  await hostJoined;

  const participantClient = createClient(socketUrl, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve) => participantClient.once('connect', resolve));
  const userJoined = waitForEvent(hostClient, 'user-joined');
  participantClient.emit('join-room', {
    roomId,
    user: { id: 'expiring-user', name: 'Expiring User' },
    accessToken: participantToken,
  });
  await userJoined;

  try {
    const userLeftPromise = waitForEvent(hostClient, 'user-left', 2000);
    // Disconnect participant and don't reconnect
    participantClient.disconnect();

    const leftEvent = await userLeftPromise;
    assert.equal(leftEvent.user.id, 'expiring-user', 'user-left must be emitted after grace period expires');
  } finally {
    hostClient.disconnect();
    io.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Rejoining attendance deduplication updates existing record instead of creating duplicates', async () => {
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: '*' } });
  setupSocketHandlers(io, { disconnectGracePeriodMs: 300 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socketUrl = `http://127.0.0.1:${server.address().port}`;

  const roomId = `attendance-room-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    title: 'Attendance Room',
    hostId: 'host-user',
    hostName: 'Host User',
    isLocked: false,
    isActive: true,
  });

  const participantToken = issueRoomAccessToken({
    roomId,
    participantId: 'attendee-1',
    role: 'participant',
    displayName: 'Attendee One',
    accountId: 'account-attendee-1',
  });

  // First join
  let client = createClient(socketUrl, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve) => client.once('connect', resolve));
  let joinedPromise = waitForEvent(client, 'room-peers');
  client.emit('join-room', {
    roomId,
    user: { id: 'attendee-1', name: 'Attendee One' },
    accessToken: participantToken,
  });
  await joinedPromise;
  client.disconnect();

  // Second join (simulate reload)
  client = createClient(socketUrl, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve) => client.once('connect', resolve));
  joinedPromise = waitForEvent(client, 'room-peers');
  client.emit('join-room', {
    roomId,
    user: { id: 'attendee-1', name: 'Attendee One' },
    accessToken: participantToken,
  });
  await joinedPromise;

  try {
    // Check in-memory attendance records for this user
    const records = Array.from(inMemoryMeetingAttendance.values()).filter(
      (a) => a.roomId === roomId && a.userId === 'account-attendee-1'
    );
    assert.equal(records.length, 1, 'There must be exactly one attendance record for this user in this room');
    assert.equal(records[0].socketId, client.id, 'The single attendance record must reflect the current socket ID');
  } finally {
    client.disconnect();
    io.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

