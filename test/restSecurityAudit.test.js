import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { test } from 'node:test';
import authRoutes from '../server/routes/authRoutes.js';
import featureRoutes from '../server/routes/meetingFeatureRoutes.js';
import roomRoutes from '../server/routes/roomRoutes.js';
import {
  inMemoryAuthSessions,
  inMemoryRooms,
  roomAgendas,
  scheduledMeetings,
} from '../server/store/memoryMeetingStore.js';
import { issueRoomAccessToken } from '../server/middleware/roomAccessMiddleware.js';

function startApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/features', featureRoutes);
  app.use('/api/rooms', roomRoutes);
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

async function request(baseUrl, path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Room-Access-Token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, data: await response.json() };
}

test('a registered account cannot use the demo password as a login bypass', async () => {
  const app = await startApp();
  const email = `rest-security-${randomUUID()}@example.test`;
  let accountId;
  try {
    const registration = await request(app.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'REST Security Audit', email, password: 'strong-password-42' },
    });
    assert.equal(registration.response.status, 201);
    accountId = registration.data.user.id;

    const bypass = await request(app.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email, password: 'password123' },
    });
    assert.equal(bypass.response.status, 401);

    const valid = await request(app.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email, password: 'strong-password-42' },
    });
    assert.equal(valid.response.status, 200);
  } finally {
    for (const [hash, session] of inMemoryAuthSessions) {
      if (session.userId === accountId) inMemoryAuthSessions.delete(hash);
    }
    await app.close();
  }
});

test('private schedules stay out of public listings and require room admission', async () => {
  const app = await startApp();
  const privateAgenda = 'confidential roadmap review';
  let privateRoomId;
  let publicRoomId;
  try {
    const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const privateSchedule = await request(app.baseUrl, '/api/features/schedules', {
      method: 'POST',
      body: {
        title: 'Private roadmap review',
        startsAt,
        timeZone: 'UTC',
        durationMinutes: 30,
        invitees: ['invitee@example.test'],
        agenda: [{ id: 'private-agenda', text: privateAgenda }],
      },
    });
    assert.equal(privateSchedule.response.status, 201);
    privateRoomId = privateSchedule.data.meeting.roomId;

    const publicSchedule = await request(app.baseUrl, '/api/features/schedules', {
      method: 'POST',
      body: {
        title: 'Public project sync',
        startsAt,
        timeZone: 'UTC',
        durationMinutes: 30,
        agenda: [{ id: 'public-agenda', text: 'Discuss project updates' }],
      },
    });
    assert.equal(publicSchedule.response.status, 201);
    publicRoomId = publicSchedule.data.meeting.roomId;

    const listing = await request(app.baseUrl, '/api/features/schedules');
    assert.equal(listing.response.status, 200);
    assert(listing.data.meetings.some((meeting) => meeting.roomId === publicRoomId));
    assert(!listing.data.meetings.some((meeting) => (
      meeting.roomId === privateRoomId
      || meeting.title === 'Private roadmap review'
      || meeting.agenda?.some((item) => item.text === privateAgenda)
    )));

    const anonymousDetails = await request(
      app.baseUrl,
      `/api/features/schedules/${encodeURIComponent(privateRoomId)}`
    );
    assert.equal(anonymousDetails.response.status, 401);

    const join = await request(app.baseUrl, `/api/rooms/${encodeURIComponent(privateRoomId)}/join`, {
      method: 'POST',
      body: { name: 'Uninvited visitor' },
    });
    assert.equal(join.response.status, 200);
    assert.equal(join.data.requiresAdmission, true);

    const unadmittedAgenda = await request(
      app.baseUrl,
      `/api/features/rooms/${encodeURIComponent(privateRoomId)}/agenda`,
      { token: join.data.accessToken }
    );
    assert.equal(unadmittedAgenda.response.status, 403);

    const hostDetails = await request(
      app.baseUrl,
      `/api/features/schedules/${encodeURIComponent(privateRoomId)}`,
      { token: privateSchedule.data.accessToken }
    );
    assert.equal(hostDetails.response.status, 200);
    assert.equal(hostDetails.data.meeting.agenda[0].text, privateAgenda);
    assert.equal(Object.hasOwn(hostDetails.data.meeting, 'invitees'), false);
    assert.equal(Object.hasOwn(hostDetails.data.meeting, 'createdBy'), false);

    const unadmittedDetails = await request(
      app.baseUrl,
      `/api/features/schedules/${encodeURIComponent(privateRoomId)}`,
      { token: join.data.accessToken }
    );
    assert.equal(unadmittedDetails.response.status, 403);
  } finally {
    if (privateRoomId) {
      scheduledMeetings.delete(privateRoomId);
      inMemoryRooms.delete(privateRoomId);
      roomAgendas.delete(privateRoomId);
    }
    if (publicRoomId) {
      scheduledMeetings.delete(publicRoomId);
      inMemoryRooms.delete(publicRoomId);
      roomAgendas.delete(publicRoomId);
    }
    await app.close();
  }
});
