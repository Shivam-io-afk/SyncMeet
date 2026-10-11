import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import {
  inMemoryMeetingAttendance,
  inMemoryRooms,
  roomQuestions,
} from '../server/store/memoryMeetingStore.js';
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

async function connectParticipant(url, roomId, participantId, role, {
  accountId,
  userOverrides = {},
  onPeers,
} = {}) {
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
    user: { id: participantId, name: participantId, ...userOverrides },
    accessToken: issueRoomAccessToken({
      roomId,
      participantId,
      displayName: participantId,
      role,
      accountId,
    }),
  });
  const peerList = await joined;
  onPeers?.(peerList);
  return client;
}

async function waitForCondition(predicate, message, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

test('active room controls use signed ticket identity instead of client role claims', async () => {
  const roomId = `socket-active-auth-${Date.now()}`;
  const room = {
    roomId,
    hostId: 'socket-real-host',
    hostName: 'Host',
    isLocked: false,
    admittedParticipantIds: [],
    participants: [],
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
    const host = await connectParticipant(url, roomId, 'socket-real-host', 'host');
    clients.push(host);
    const attacker = await connectParticipant(
      url,
      roomId,
      'socket-attacker',
      'participant',
      { userOverrides: { role: 'host', isHost: true, accountId: 'socket-real-host' } }
    );
    clients.push(attacker);

    assert.equal(await expectNoEvent(host, 'host-mute-all-command', () => {
      attacker.emit('host-mute-all');
    }), false, 'a participant ticket with client-supplied host fields cannot issue host mute');

    assert.equal(await expectNoEvent(host, 'room-lock-status', () => {
      attacker.emit('host-lock-room', { isLocked: true, role: 'host', isHost: true });
    }), false, 'a participant ticket cannot lock the room by spoofing payload role fields');
    assert.equal(room.isLocked, false);
    assert.equal(
      inMemoryMeetingAttendance.has(`${roomId}:socket-real-host`),
      false,
      'an account ID supplied only in client fields must not be recorded as attendance'
    );

  } finally {
    for (const client of clients) client.disconnect();
    inMemoryRooms.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});

test('temporary disconnect preserves room membership while intentional leave cleans it and closes attendance', async () => {
  const roomId = `socket-leave-state-${Date.now()}`;
  const accountId = `account-${roomId}`;
  const attendanceKey = `${roomId}:${accountId}`;
  const room = {
    roomId,
    hostId: 'socket-host',
    hostName: 'Host',
    isLocked: false,
    admittedParticipantIds: [],
    participants: [],
    attendeeIds: [],
    isActive: true,
  };
  inMemoryRooms.set(roomId, room);

  const server = http.createServer();
  const io = new Server(server);
  setupSocketHandlers(io, { disconnectGracePeriodMs: 5_000 });
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];

  try {
    const firstClient = await connectParticipant(url, roomId, 'stable-participant', 'participant', { accountId });
    clients.push(firstClient);
    assert.equal(inMemoryMeetingAttendance.get(attendanceKey)?.leftAt, null);
    assert.equal(room.participants.length, 1);

    firstClient.disconnect();
    await waitForCondition(
      () => room.participants.length === 1 && room.participants[0]?.socketId === null,
      'temporary disconnect should preserve the participant record and clear its transient socket ID'
    );
    assert.equal(inMemoryMeetingAttendance.get(attendanceKey)?.leftAt, null);

    const reconnectedClient = await connectParticipant(
      url,
      roomId,
      'stable-participant',
      'participant',
      { accountId }
    );
    clients.push(reconnectedClient);
    await waitForCondition(
      () => room.participants.length === 1 && room.participants[0]?.socketId !== null,
      'rejoin should replace the stable participant record rather than duplicate it'
    );
    assert.notEqual(room.participants[0].socketId, null);
    assert.equal(inMemoryMeetingAttendance.get(attendanceKey)?.leftAt, null);

    reconnectedClient.emit('leave-room');
    await waitForCondition(
      () => room.participants.length === 0 && inMemoryMeetingAttendance.get(attendanceKey)?.leftAt instanceof Date,
      'intentional leave should remove participant state and mark attendance as left'
    );
    assert.deepEqual(room.admittedParticipantIds, []);
  } finally {
    for (const client of clients) client.disconnect();
    inMemoryMeetingAttendance.delete(attendanceKey);
    inMemoryRooms.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});

test('intentional leave unsubscribes the socket from later room broadcasts', async () => {
  const roomId = `socket-leave-broadcast-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    hostId: 'leave-broadcast-host',
    hostName: 'Host',
    isLocked: false,
    admittedParticipantIds: [],
    participants: [],
    isActive: true,
  });

  const server = http.createServer();
  const io = new Server(server);
  setupSocketHandlers(io);
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];

  try {
    const host = await connectParticipant(url, roomId, 'leave-broadcast-host', 'host');
    clients.push(host);
    const attendee = await connectParticipant(url, roomId, 'leave-broadcast-attendee', 'participant');
    clients.push(attendee);

    const attendeeLeft = waitForEvent(host, 'user-left');
    attendee.emit('leave-room');
    await attendeeLeft;
    await waitForCondition(
      () => inMemoryRooms.get(roomId)?.participants.length === 1,
      'intentional leave should remove the attendee before subsequent room broadcasts'
    );

    assert.equal(await expectNoEvent(attendee, 'room-lock-status', () => {
      host.emit('host-lock-room', { isLocked: true });
    }), false, 'a departed participant must not receive room broadcasts');
  } finally {
    for (const client of clients) client.disconnect();
    inMemoryRooms.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});

test('participants cannot forge meeting poll or question deletion broadcasts', async () => {
  const roomId = `socket-delete-broadcast-auth-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    hostId: 'delete-broadcast-host',
    hostName: 'Host',
    isLocked: false,
    admittedParticipantIds: [],
    participants: [],
    isActive: true,
  });
  roomQuestions.set(roomId, [{
    id: 'attendee-owned-question',
    roomId,
    authorId: 'delete-broadcast-attendee',
  }]);

  const server = http.createServer();
  const io = new Server(server);
  setupSocketHandlers(io);
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];

  try {
    const host = await connectParticipant(url, roomId, 'delete-broadcast-host', 'host');
    clients.push(host);
    const attendee = await connectParticipant(url, roomId, 'delete-broadcast-attendee', 'participant');
    clients.push(attendee);

    assert.equal(await expectNoEvent(host, 'meeting-poll-deleted', () => {
      attendee.emit('meeting-poll-deleted', { pollId: 'forged-poll' });
    }), false, 'participants cannot broadcast forged poll deletions');
    assert.equal(await expectNoEvent(host, 'meeting-question-deleted', () => {
      attendee.emit('meeting-question-deleted', { questionId: 'forged-question' });
    }), false, 'participants cannot broadcast forged question deletions');

    const ownedQuestionDeletion = waitForEvent(host, 'meeting-question-deleted');
    attendee.emit('meeting-question-deleted', { questionId: 'attendee-owned-question' });
    assert.equal((await ownedQuestionDeletion).questionId, 'attendee-owned-question');
  } finally {
    for (const client of clients) client.disconnect();
    inMemoryRooms.delete(roomId);
    roomQuestions.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});

test('disconnect and reconnect state is broadcast and included in the peer snapshot', async () => {
  const roomId = `socket-reconnect-broadcast-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    hostId: 'reconnect-host',
    hostName: 'Host',
    isLocked: false,
    admittedParticipantIds: [],
    participants: [],
    isActive: true,
  });

  const server = http.createServer();
  const io = new Server(server);
  setupSocketHandlers(io, { disconnectGracePeriodMs: 5_000 });
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];

  try {
    const host = await connectParticipant(url, roomId, 'reconnect-host', 'host');
    clients.push(host);
    const attendee = await connectParticipant(url, roomId, 'reconnect-attendee', 'participant');
    clients.push(attendee);
    const oldSocketId = attendee.id;

    const disconnected = waitForEvent(host, 'user-disconnected');
    attendee.disconnect();
    assert.equal((await disconnected).socketId, oldSocketId);

    let snapshot;
    const lateJoiner = await connectParticipant(url, roomId, 'reconnect-late-joiner', 'participant', {
      onPeers: (peerList) => { snapshot = peerList; },
    });
    clients.push(lateJoiner);
    const disconnectedPeer = snapshot.peers.find((peer) => peer.socketId === oldSocketId);
    assert.equal(disconnectedPeer?.isDisconnected, true);

    const reconnected = waitForEvent(host, 'user-reconnected');
    const replacement = await connectParticipant(url, roomId, 'reconnect-attendee', 'participant');
    clients.push(replacement);
    const event = await reconnected;
    assert.equal(event.oldSocketId, oldSocketId);
    assert.equal(event.newSocketId, replacement.id);
  } finally {
    for (const client of clients) client.disconnect();
    inMemoryRooms.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});

test('a participant rejoining before disconnect cleanup replaces the previous socket', async () => {
  const roomId = `socket-duplicate-identity-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    hostId: 'duplicate-host',
    hostName: 'Host',
    isLocked: false,
    admittedParticipantIds: [],
    participants: [],
    isActive: true,
  });

  const server = http.createServer();
  const io = new Server(server);
  setupSocketHandlers(io, { disconnectGracePeriodMs: 5_000 });
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];

  try {
    const host = await connectParticipant(url, roomId, 'duplicate-host', 'host');
    clients.push(host);
    const first = await connectParticipant(url, roomId, 'duplicate-attendee', 'participant');
    clients.push(first);
    const oldSocketId = first.id;

    const replacementEvent = waitForEvent(host, 'user-reconnected');
    const replacement = await connectParticipant(url, roomId, 'duplicate-attendee', 'participant');
    clients.push(replacement);

    const event = await replacementEvent;
    assert.equal(event.oldSocketId, oldSocketId);
    assert.equal(event.newSocketId, replacement.id);
    assert.equal(first.connected, false, 'the superseded socket should be disconnected');
    assert.equal(
      inMemoryRooms.get(roomId).participants.filter(
        (participant) => participant.userId === 'duplicate-attendee'
      ).length,
      1,
      'only the replacement socket should have persisted participant state'
    );

    let snapshot;
    const lateJoiner = await connectParticipant(url, roomId, 'duplicate-late-joiner', 'participant', {
      onPeers: (payload) => { snapshot = payload; },
    });
    clients.push(lateJoiner);
    assert.equal(
      snapshot.peers.filter((peer) => peer.user?.id === 'duplicate-attendee').length,
      1,
      'room membership must contain only one socket for a participant identity'
    );
  } finally {
    for (const client of clients) client.disconnect();
    inMemoryRooms.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});

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

test('screen-share state is room-scoped and included for participants joining mid-share', async () => {
  const roomA = `socket-screen-share-a-${Date.now()}`;
  const roomB = `socket-screen-share-b-${Date.now()}`;
  for (const roomId of [roomA, roomB]) {
    inMemoryRooms.set(roomId, {
      roomId,
      hostId: `host-${roomId}`,
      hostName: 'Host',
      isLocked: false,
      admittedParticipantIds: [],
      participants: [],
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
    const presenter = await connectParticipant(url, roomA, `presenter-${roomA}`, 'participant');
    clients.push(presenter);

    const started = waitForEvent(hostA, 'participant-screen-share');
    presenter.emit('screen-share-state', { isScreenSharing: true });
    assert.deepEqual(await started, {
      socketId: presenter.id,
      isScreenSharing: true,
    });
    assert.equal(await expectNoEvent(hostB, 'participant-screen-share', () => {}), false);

    let lateJoinPeers;
    const lateJoiner = await connectParticipant(url, roomA, `late-${roomA}`, 'participant', {
      onPeers: (payload) => { lateJoinPeers = payload; },
    });
    clients.push(lateJoiner);
    const activePresenter = lateJoinPeers.peers.find((peer) => peer.socketId === presenter.id);
    assert.equal(activePresenter?.isScreenSharing, true);
    assert.equal(activePresenter?.user?.isScreenSharing, true);

    const stopped = waitForEvent(hostA, 'participant-screen-share');
    presenter.emit('screen-share-state', { isScreenSharing: false });
    assert.deepEqual(await stopped, {
      socketId: presenter.id,
      isScreenSharing: false,
    });

    const presenterRestarted = waitForEvent(hostA, 'participant-screen-share');
    presenter.emit('screen-share-state', { isScreenSharing: true });
    await presenterRestarted;
    const presenterLeft = waitForEvent(hostA, 'participant-screen-share');
    presenter.emit('leave-room');
    assert.deepEqual(await presenterLeft, {
      socketId: presenter.id,
      isScreenSharing: false,
    });

    const latePresenterStarted = waitForEvent(hostA, 'participant-screen-share');
    lateJoiner.emit('screen-share-state', { isScreenSharing: true });
    assert.equal((await latePresenterStarted).isScreenSharing, true);
    const lateJoinerSocketId = lateJoiner.id;
    const latePresenterDisconnected = waitForEvent(hostA, 'participant-screen-share');
    lateJoiner.disconnect();
    assert.deepEqual(await latePresenterDisconnected, {
      socketId: lateJoinerSocketId,
      isScreenSharing: false,
    });

    const unjoined = createClient(url, { transports: ['websocket'], reconnection: false });
    clients.push(unjoined);
    await waitForEvent(unjoined, 'connect');
    assert.equal(await expectNoEvent(hostA, 'participant-screen-share', () => {
      unjoined.emit('screen-share-state', { isScreenSharing: true });
    }), false);
  } finally {
    for (const client of clients) client.disconnect();
    inMemoryRooms.delete(roomA);
    inMemoryRooms.delete(roomB);
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
    'screen-share-state',
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

test('only a host in the active room can admit or deny a pending knock', async () => {
  const roomId = `socket-admission-auth-${Date.now()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    hostId: 'admission-auth-host',
    hostName: 'Host',
    isLocked: false,
    admittedParticipantIds: [],
    isActive: true,
  });

  const server = http.createServer();
  const io = new Server(server);
  setupSocketHandlers(io);
  await listen(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];

  try {
    const host = await connectParticipant(url, roomId, 'admission-auth-host', 'host');
    clients.push(host);
    const participant = await connectParticipant(url, roomId, 'admission-auth-participant', 'participant');
    clients.push(participant);
    const applicant = createClient(url, { transports: ['websocket'], reconnection: false });
    clients.push(applicant);
    await new Promise((resolve, reject) => {
      applicant.once('connect', resolve);
      applicant.once('connect_error', reject);
    });

    const knock = waitForEvent(host, 'knock-request');
    applicant.emit('knock-room', {
      roomId,
      accessToken: issueRoomAccessToken({
        roomId,
        participantId: 'admission-auth-applicant',
        displayName: 'Applicant',
        role: 'participant',
      }),
    });
    const request = await knock;
    const rejectedAttempt = expectNoEvent(applicant, 'knock-response', () => {
      participant.emit('admit-user', { applicantSocketId: request.applicantSocketId });
      participant.emit('deny-user', { applicantSocketId: request.applicantSocketId });
    });
    assert.equal(await rejectedAttempt, false, 'a participant ticket cannot resolve a pending knock');
    assert.equal(
      applicant.connected,
      true,
      'the pending applicant remains connected after unauthorized admission attempts'
    );

    const denied = waitForEvent(applicant, 'knock-response');
    host.emit('deny-user', {
      applicantSocketId: request.applicantSocketId,
      user: { name: 'forged display name' },
    });
    assert.equal((await denied).approved, false);
    assert.deepEqual(inMemoryRooms.get(roomId).admittedParticipantIds, []);

    const secondKnock = waitForEvent(host, 'knock-request');
    applicant.emit('knock-room', {
      roomId,
      accessToken: issueRoomAccessToken({
        roomId,
        participantId: 'admission-auth-applicant',
        displayName: 'Applicant',
        role: 'participant',
      }),
    });
    const secondRequest = await secondKnock;
    const admitted = waitForEvent(applicant, 'knock-response');
    host.emit('admit-user', { applicantSocketId: secondRequest.applicantSocketId });
    assert.equal((await admitted).approved, true);
    assert.deepEqual(inMemoryRooms.get(roomId).admittedParticipantIds, ['admission-auth-applicant']);
  } finally {
    for (const client of clients) client.disconnect();
    inMemoryRooms.delete(roomId);
    await new Promise((resolve) => io.close(resolve));
  }
});
