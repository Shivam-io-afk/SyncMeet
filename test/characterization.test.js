import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import authRoutes from '../server/routes/authRoutes.js';
import roomRoutes from '../server/routes/roomRoutes.js';
import featureRoutes from '../server/routes/meetingFeatureRoutes.js';
import historyRoutes from '../server/routes/historyRoutes.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  // Basic cookie parsing middleware for tests
  app.use((req, res, next) => {
    const cookieHeader = req.headers.cookie;
    req.cookies = {};
    if (cookieHeader) {
      cookieHeader.split(';').forEach((cookie) => {
        const [name, ...val] = cookie.trim().split('=');
        if (name && val.length > 0) req.cookies[name] = decodeURIComponent(val.join('='));
      });
    }
    next();
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/features', featureRoutes);
  app.use('/api/history', historyRoutes);
  return app;
}

function startServer(app) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve) => {
    server.once('listening', () =>
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done, reject) => {
            server.close((err) => (err ? reject(err) : done()));
          }),
      })
    );
  });
}

async function apiRequest(baseUrl, path, { method = 'GET', body, token, bearerToken, cookie } = {}) {
  const headers = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'X-Room-Access-Token': token } : {}),
    ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
  };
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  const setCookie = response.headers.get('set-cookie');
  return { response, status: response.status, data, setCookie };
}

test('Characterization: Complete User Authentication Lifecycle', async () => {
  const app = createTestApp();
  const server = await startServer(app);
  try {
    const uniqueEmail = `char_user_${Date.now()}@syncmeet.ai`;

    // 1. User Registration
    const regRes = await apiRequest(server.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Characterization User', email: uniqueEmail, password: 'SecurePassword123!' },
    });
    assert.equal(regRes.status, 201, 'Registration should return 201 Created');
    assert.equal(regRes.data.success, true);
    assert.ok(regRes.data.token, 'Should return access JWT');
    assert.ok(regRes.setCookie, 'Should set refresh token cookie');
    const userToken = regRes.data.token;

    // Extract syncmeet_refresh cookie
    const refreshCookieMatch = regRes.setCookie.match(/syncmeet_refresh=([^;]+)/);
    assert.ok(refreshCookieMatch, 'Should contain syncmeet_refresh cookie in response headers');
    const refreshCookie = `syncmeet_refresh=${refreshCookieMatch[1]}`;

    // 2. Fetch Profile via /api/auth/me
    const meRes = await apiRequest(server.baseUrl, '/api/auth/me', {
      method: 'GET',
      bearerToken: userToken,
    });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.user.email, uniqueEmail);

    // 3. User Login
    const loginRes = await apiRequest(server.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: uniqueEmail, password: 'SecurePassword123!' },
    });
    assert.equal(loginRes.status, 200, 'Login should return 200 OK');
    assert.equal(loginRes.data.success, true);
    assert.ok(loginRes.data.token);

    // 4. Token Refresh
    const refreshRes = await apiRequest(server.baseUrl, '/api/auth/refresh', {
      method: 'POST',
      cookie: refreshCookie,
    });
    assert.equal(refreshRes.status, 200, 'Refresh should return 200 OK');
    assert.ok(refreshRes.data.token, 'Refresh should issue a fresh access token');

    // 5. Logout
    const logoutRes = await apiRequest(server.baseUrl, '/api/auth/logout', {
      method: 'POST',
      cookie: refreshCookie,
    });
    assert.equal(logoutRes.status, 200, 'Logout should succeed');
  } finally {
    await server.close();
  }
});

test('Characterization: Room Creation, Guest Join, and Leave Flow', async () => {
  const app = createTestApp();
  const server = await startServer(app);
  try {
    // 1. Create an instant guest room
    const createRes = await apiRequest(server.baseUrl, '/api/rooms/guest', {
      method: 'POST',
      body: { title: 'Characterization Room', hostName: 'Host Moderator', isLocked: false },
    });
    assert.equal(createRes.status, 201, 'Guest room creation should return 201');
    assert.equal(createRes.data.success, true);
    const roomId = createRes.data.room.roomId;
    const hostToken = createRes.data.accessToken;
    assert.ok(roomId, 'Room ID must be generated');
    assert.ok(hostToken, 'Host room access token must be issued');

    // 2. Verify room state via GET /api/rooms/:roomId
    const getRes = await apiRequest(server.baseUrl, `/api/rooms/${roomId}`, {
      method: 'GET',
      token: hostToken,
    });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.data.room.roomId, roomId);
    assert.equal(getRes.data.room.title, 'Characterization Room');

    // 3. A participant joins the room
    const joinRes = await apiRequest(server.baseUrl, `/api/rooms/${roomId}/join`, {
      method: 'POST',
      body: { name: 'Attendee Bob' },
    });
    assert.equal(joinRes.status, 200);
    assert.equal(joinRes.data.role, 'participant');
    assert.ok(joinRes.data.accessToken);
    assert.equal(joinRes.data.participant.name, 'Attendee Bob');
    const participantToken = joinRes.data.accessToken;

    // 4. Feature access verification using participant room token
    const pollCreateRes = await apiRequest(server.baseUrl, `/api/features/rooms/${roomId}/polls`, {
      method: 'POST',
      token: participantToken,
      body: {
        question: 'Is this characterization test passing?',
        options: ['Yes, fully', 'Working on it'],
      },
    });
    assert.equal(pollCreateRes.status, 201);
    assert.equal(pollCreateRes.data.poll.question, 'Is this characterization test passing?');

    // 5. Host closes the poll
    const pollId = pollCreateRes.data.poll.id;
    const closePollRes = await apiRequest(server.baseUrl, `/api/features/rooms/${roomId}/polls/${pollId}/close`, {
      method: 'PATCH',
      token: hostToken,
    });
    assert.equal(closePollRes.status, 200);
    assert.equal(closePollRes.data.poll.status, 'closed');
  } finally {
    await server.close();
  }
});
