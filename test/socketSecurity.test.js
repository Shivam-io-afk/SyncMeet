import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import { inMemoryRooms } from '../server/store/memoryMeetingStore.js';
import { issueRoomAccessToken } from '../server/middleware/roomAccessMiddleware.js';
import { setupSocketHandlers } from '../server/socket/socketHandler.js';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function waitForEvent(client, event, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const listener = (payload) => {
      clearTimeout(timeout);
      client.off(event, listener);
      resolve(payload);
    };
    client.on(event, listener);
  });
}

function expectNoEvent(client, event, emit, timeoutMs = 150) {
  const received = waitForEvent(client, event, timeoutMs).then(
    () => true,
    () => false
  );
  emit();
  return received;
}

async function connectParticipant(url, roomId, participantId, role) {
  const client = createClient(url, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out connecting ${participantId}`)), 2_000);
    client.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    client.once('connect_error', reject);
  });
  const joined = waitForEvent(client, 'room-peers');
  client.emit('join-room', {
    roomId,
    user: { id: participantId, name: participantId },
    accessToken: issueRoomAccessToken({
      roomId,
      participantId,
      displayName: participantId,
      role,
    }),
  });
  await joined;
  return client;
}

test('ended meetings reject stale host controls and clean meeting socket state', async () => {
  const roomId = `socket-ended-${Date.now()}`;
  const room = {
    roomId,
    hostId: 'socket-host',
    hostName: 'Host',
    isLocked: false,
    admittedParticipantIds: [],
    isActive: true,
  };
  inMemoryRooms.set(roomId, room);

  const server = http.createServer();
  const io = new Server(server);
  setupSocketHandlers(io);
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];

  try {
    const host = await connectParticipant(url, roomId, 'socket-host', 'host');
    clients.push(host);
    const attendee = await connectParticipant(url, roomId, 'socket-attendee', 'participant');
    clients.push(attendee);
    const waitingParticipant = await connectParticipant(url, roomId, 'socket-waiter', 'participant');
    clients.push(waitingParticipant);

    assert.equal(await expectNoEvent(attendee, 'participant-media-state', () => {
      waitingParticipant.emit('update-media-state', { isMuted: 'false', isVideoOff: false });
    }), false);
    assert.equal(await expectNoEvent(attendee, 'user-hand-updated', () => {
      waitingParticipant.emit('toggle-hand-raise', { isHandRaised: 'false' });
    }), false);

    const knock = waitForEvent(host, 'knock-request');
    waitingParticipant.emit('knock-room', {
      roomId,
      accessToken: issueRoomAccessToken({
        roomId,
        participantId: 'socket-waiter',
        displayName: 'socket-waiter',
        role: 'participant',
      }),
    });
    const request = await knock;
    let endedCount = 0;
    attendee.on('meeting-ended-by-host', () => { endedCount += 1; });
    const ended = waitForEvent(attendee, 'meeting-ended-by-host');
    host.emit('host-end-meeting');
    await ended;
    assert.equal(room.isActive, false);

    assert.equal(await expectNoEvent(attendee, 'host-mute-all-command', () => {
      host.emit('host-mute-all');
    }), false);
    assert.equal(await expectNoEvent(attendee, 'room-lock-status', () => {
      host.emit('host-lock-room', { isLocked: true });
    }), false);
    assert.equal(room.isLocked, false, 'a former room member cannot change its lock state');
    assert.equal(await expectNoEvent(attendee, 'meeting-ended-by-host', () => {
      host.emit('host-end-meeting');
    }), false);
    assert.equal(await expectNoEvent(waitingParticipant, 'knock-response', () => {
      host.emit('admit-user', { applicantSocketId: request.applicantSocketId });
    }), false);
    const inactiveRoomRejection = waitForEvent(waitingParticipant, 'room-join-error');
    assert.equal(await expectNoEvent(attendee, 'knock-request', () => {
      waitingParticipant.emit('knock-room', {
        roomId,
        accessToken: issueRoomAccessToken({
          roomId,
          participantId: 'socket-waiter',
          displayName: 'socket-waiter',
          role: 'participant',
        }),
      });
    }), false);
    assert.match((await inactiveRoomRejection).message, /inactive|no longer exists/i);
    assert.equal(endedCount, 1);
  } finally {
    for (const client of clients) client.disconnect();
    inMemoryRooms.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});

test('malformed object payloads are ignored by Socket.IO listeners', async () => {
  const listeners = new Map();
  let onConnection;
  const socket = {
    id: 'socket-unit-test',
    on: (event, listener) => listeners.set(event, listener),
    emit: () => {},
    to: () => ({ emit: () => {} }),
    join: () => {},
    leave: () => {},
  };
  const io = {
    on: (_event, listener) => { onConnection = listener; },
    to: () => ({ except() { return this; }, emit: () => {} }),
    sockets: { sockets: new Map() },
  };
  setupSocketHandlers(io);
  onConnection(socket);

  const payloadEvents = [
    'knock-room',
    'admit-user',
    'deny-user',
    'join-room',
    'update-media-state',
    'webrtc-offer',
    'webrtc-answer',
    'webrtc-ice-candidate',
    'ice-restart-request',
    'start-breakout',
    'end-breakout',
    'toggle-hand-raise',
    'host-lock-room',
  ];
  for (const event of payloadEvents) {
    for (const payload of [null, undefined]) {
      await assert.doesNotReject(
        async () => listeners.get(event)(payload),
        `${event} should ignore ${String(payload)} payloads`
      );
    }
  }
});

test('waiting-room admission is scoped to the room that granted it', async () => {
  const roomA = `socket-admission-a-${Date.now()}`;
  const roomB = `socket-admission-b-${Date.now()}`;
  for (const roomId of [roomA, roomB]) {
    inMemoryRooms.set(roomId, {
      roomId,
      hostId: `host-${roomId}`,
      hostName: 'Host',
      isLocked: true,
      admittedParticipantIds: [],
      isActive: true,
    });
  }

  const server = http.createServer();
  const io = new Server(server);
  setupSocketHandlers(io);
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];

  try {
    const hostA = await connectParticipant(url, roomA, `host-${roomA}`, 'host');
    clients.push(hostA);
    const hostB = await connectParticipant(url, roomB, `host-${roomB}`, 'host');
    clients.push(hostB);
    const applicant = createClient(url, { transports: ['websocket'], reconnection: false });
    clients.push(applicant);
    await new Promise((resolve, reject) => {
      applicant.once('connect', resolve);
      applicant.once('connect_error', reject);
    });

    const knock = waitForEvent(hostA, 'knock-request');
    const approved = waitForEvent(applicant, 'knock-response');
    applicant.emit('knock-room', {
      roomId: roomA,
      accessToken: issueRoomAccessToken({
        roomId: roomA,
        participantId: 'shared-applicant',
        displayName: 'Applicant',
        role: 'participant',
      }),
    });
    const request = await knock;
    hostA.emit('admit-user', { applicantSocketId: request.applicantSocketId });
    assert.equal((await approved).approved, true);

    const roomJoinError = waitForEvent(applicant, 'room-join-error');
    const joinedRoomB = expectNoEvent(applicant, 'room-peers', () => {
      applicant.emit('join-room', {
        roomId: roomB,
        user: { parentRoomId: roomB },
        accessToken: issueRoomAccessToken({
          roomId: roomB,
          participantId: 'shared-applicant',
          displayName: 'Applicant',
          role: 'participant',
        }),
      });
    });
    assert.match((await roomJoinError).message, /locked|admitted/i);
    assert.equal(await joinedRoomB, false, 'room A admission must not grant access to locked room B');
  } finally {
    for (const client of clients) client.disconnect();
    inMemoryRooms.delete(roomA);
    inMemoryRooms.delete(roomB);
    await new Promise((resolve) => io.close(resolve));
  }
});
