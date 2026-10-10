import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import authRoutes from '../server/routes/authRoutes.js';
import historyRoutes from '../server/routes/historyRoutes.js';
import roomRoutes from '../server/routes/roomRoutes.js';
import featureRoutes from '../server/routes/meetingFeatureRoutes.js';
import { issueRoomAccessToken } from '../server/middleware/roomAccessMiddleware.js';
import { inMemoryRooms } from '../server/store/memoryMeetingStore.js';
import { setupSocketHandlers } from '../server/socket/socketHandler.js';

function startApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/history', historyRoutes);
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

async function request(baseUrl, path, { method = 'GET', body, token, bearerToken, cookie } = {}) {
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
  return { response, data: await response.json().catch(() => ({})) };
}

function findFilesInDir(dir, filter) {
  let results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist' && entry !== '.git') {
        results = results.concat(findFilesInDir(fullPath, filter));
      }
    } else if (filter(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

test('frontend keeps localStorage limited to the explicit theme preference', () => {
  const srcFiles = findFilesInDir('src', (file) => /\.(jsx?|tsx?)$/.test(file));
  assert.ok(srcFiles.length > 0, 'src files should exist');

  const filesWithUnexpectedLocalStorage = [];
  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf-8');
    const isThemeContext = file.split(/[\\/]/).slice(-3).join('/') === 'src/context/ThemeContext.jsx';
    if (content.includes('localStorage') && !isThemeContext) {
      filesWithUnexpectedLocalStorage.push(file);
    }
  }

  assert.deepEqual(
    filesWithUnexpectedLocalStorage,
    [],
    `Found localStorage outside the theme preference: ${filesWithUnexpectedLocalStorage.join(', ')}.`
  );

  const themeContextPath = srcFiles.find(
    (file) => file.split(/[\\/]/).slice(-3).join('/') === 'src/context/ThemeContext.jsx'
  );
  assert.ok(themeContextPath, 'theme context should exist');
  const themeContext = readFileSync(themeContextPath, 'utf-8');
  assert.match(themeContext, /const THEME_STORAGE_KEY = 'syncmeet_theme';/);
  assert.match(themeContext, /createContext\(null\)/, 'theme consumers should require a provider');
  assert.match(
    themeContext,
    /event\.key !== THEME_STORAGE_KEY && event\.key !== null/,
    'clearing localStorage in another tab should restore the system theme'
  );
  assert.match(themeContext, /if \(!context\) \{\s*throw new Error\('useTheme must be used within a ThemeProvider'\);/);
  assert.deepEqual(
    [...themeContext.matchAll(/localStorage\.(?:getItem|setItem)\(([^)]*)\)/g)].map(([, args]) => args.trim()),
    ['THEME_STORAGE_KEY', 'THEME_STORAGE_KEY, legacyStored', 'THEME_STORAGE_KEY, theme'],
    'localStorage access must remain scoped to the explicit theme preference'
  );
});

test('meeting effect cleanup preserves reconnect membership while explicit finish leaves', () => {
  const appSource = readFileSync('src/App.jsx', 'utf-8');
  const socketEffectStart = appSource.indexOf("socketService.on('room-join-error', handleJoinError);");
  const socketEffectEnd = appSource.indexOf('}, [session?.roomId', socketEffectStart);
  assert.notEqual(socketEffectStart, -1, 'meeting socket effect should subscribe to join errors');
  assert.notEqual(socketEffectEnd, -1, 'meeting socket effect should have a cleanup boundary');
  assert.doesNotMatch(
    appSource.slice(socketEffectStart, socketEffectEnd),
    /socketService\.leaveRoom\(\)/,
    'React effect cleanup must not convert rehydration or StrictMode reruns into permanent leaves'
  );

  const finishStart = appSource.indexOf('const finishMeeting = useCallback(async () => {');
  const finishEnd = appSource.indexOf('}, [clearTranscripts, saveMeetingHistory]);', finishStart);
  assert.notEqual(finishStart, -1, 'explicit meeting finish handler should exist');
  assert.notEqual(finishEnd, -1, 'explicit meeting finish handler should have a boundary');
  assert.match(
    appSource.slice(finishStart, finishEnd),
    /socketService\.leaveRoom\(\)/,
    'intentional leave must still revoke the participant membership'
  );
});

test('camera and microphone access waits until after login and missing mic is not shown ready', () => {
  const appSource = readFileSync('src/App.jsx', 'utf-8');
  const mediaHook = readFileSync('src/hooks/useMediaDevices.js', 'utf-8');
  const deviceSetup = readFileSync('src/components/lobby/DeviceSetup.jsx', 'utf-8');

  assert.match(
    appSource,
    /useMediaDevices\(\{\s*enabled:\s*viewMode !== 'login'\s*\}\)/,
    'media access should remain disabled while the login view is active'
  );
  assert.match(
    mediaHook,
    /if \(enabled\) \{\s*startStreamRef\.current\(\);/,
    'the media hook should only acquire devices when enabled'
  );
  assert.match(
    deviceSetup,
    /hasAudioTrack \? 'Microphone ready' : 'Microphone unavailable'/,
    'the lobby should not report a ready microphone when no live track exists'
  );
});

test('meeting archives save with host room token and are retrievable by room token', async () => {
  const app = await startApp();
  const roomId = `room-${randomUUID()}`;
  const hostId = `host-${randomUUID()}`;
  const hostToken = issueRoomAccessToken({
    roomId,
    participantId: hostId,
    role: 'host',
    displayName: 'Test Host',
  });

  try {
    // 1. Create room
    const createRes = await request(app.baseUrl, '/api/rooms/guest', {
      method: 'POST',
      body: { title: 'Architecture Review', hostName: 'Test Host' },
    });
    assert.equal(createRes.response.status, 201);
    const createdRoomId = createRes.data.room.roomId;
    const createdHostToken = createRes.data.accessToken;

    // 2. Save meeting archive with transcripts and AI notes
    const archiveData = {
      roomId: createdRoomId,
      title: 'Architecture Review',
      hostName: 'Test Host',
      transcripts: [
        { speaker: 'Test Host', text: 'Let us review the database sync.', timestamp: '10:00 AM' },
        { speaker: 'Test Host', text: 'All storage moved to sessionStorage and Mongo.', timestamp: '10:01 AM' },
      ],
      aiNotes: {
        summary: 'Reviewed database sync and verified zero localStorage.',
        decisions: ['Use MongoDB as source of truth', 'Use sessionStorage for temporary state'],
        actionItems: [{ task: 'Verify all routes pass tests', assignee: 'Team', priority: 'High' }],
        openQuestions: [],
      },
    };

    const saveRes = await request(app.baseUrl, `/api/history/${createdRoomId}/save`, {
      method: 'POST',
      token: createdHostToken,
      body: archiveData,
    });
    assert.equal(saveRes.response.status, 201);
    assert.equal(saveRes.data.success, true);

    // 3. Fetch archive using room token
    const fetchRes = await request(app.baseUrl, `/api/history/${createdRoomId}`, {
      method: 'GET',
      token: createdHostToken,
    });
    assert.equal(fetchRes.response.status, 200);
    assert.equal(fetchRes.data.success, true);
    assert.equal(fetchRes.data.record.roomId, createdRoomId);
    assert.equal(fetchRes.data.record.transcripts.length, 2);
    assert.equal(fetchRes.data.record.aiNotes.decisions.length, 2);
  } finally {
    await app.close();
  }
});

test('PUT /api/auth/profile updates authenticated user profile and reflects in GET /api/auth/me', async () => {
  const app = await startApp();
  try {
    // 1. Unauthenticated update is rejected with 401
    const unauthRes = await request(app.baseUrl, '/api/auth/profile', {
      method: 'PUT',
      body: { name: 'New Name' },
    });
    assert.equal(unauthRes.response.status, 401);

    // 2. Register account
    const email = `profile-tester-${Date.now()}@syncmeet.ai`;
    const regRes = await request(app.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Initial Name', email, password: 'StrongPassword123!' },
    });
    assert.equal(regRes.response.status, 201);
    const token = regRes.data.token;
    assert.ok(token);

    // 3. Reject empty update
    const emptyRes = await request(app.baseUrl, '/api/auth/profile', {
      method: 'PUT',
      bearerToken: token,
      body: {},
    });
    assert.equal(emptyRes.response.status, 400);

    // 4. Update name, title, and avatarColor
    const updateRes = await request(app.baseUrl, '/api/auth/profile', {
      method: 'PUT',
      bearerToken: token,
      body: {
        name: 'Updated Name',
        title: 'Staff Architect',
        avatarColor: 'from-emerald-600 to-teal-500',
      },
    });
    assert.equal(updateRes.response.status, 200);
    assert.equal(updateRes.data.success, true);
    assert.equal(updateRes.data.user.name, 'Updated Name');
    assert.equal(updateRes.data.user.title, 'Staff Architect');
    assert.equal(updateRes.data.user.avatarColor, 'from-emerald-600 to-teal-500');

    // 5. Verify GET /api/auth/me returns the updated profile
    const meRes = await request(app.baseUrl, '/api/auth/me', {
      method: 'GET',
      bearerToken: token,
    });
    assert.equal(meRes.response.status, 200);
    assert.equal(meRes.data.user.name, 'Updated Name');
    assert.equal(meRes.data.user.title, 'Staff Architect');
    assert.equal(meRes.data.user.avatarColor, 'from-emerald-600 to-teal-500');
  } finally {
    await app.close();
  }
});

test('in-room chat buffer stores sent messages and emits room-chat-history to newly joining participants', async () => {
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: '*' } });
  setupSocketHandlers(io);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socketUrl = `http://127.0.0.1:${server.address().port}`;

  const roomId = `chat-room-${randomUUID()}`;
  inMemoryRooms.set(roomId, {
    roomId,
    title: 'Chat Test Room',
    hostId: 'host-user',
    hostName: 'Host User',
    isLocked: false,
    isActive: true,
  });

  const connectUser = async (participantId, role) => {
    const client = createClient(socketUrl, { transports: ['websocket'], reconnection: false });
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    const joined = new Promise((resolve) => client.once('room-peers', resolve));
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
  };

  const client1 = await connectUser('user-1', 'host');
  const client2 = await connectUser('user-2', 'participant');

  try {
    // Client 1 sends a chat message
    const msgReceivedBy2 = new Promise((resolve) => client2.once('receive-chat-message', resolve));
    client1.emit('send-chat-message', { text: 'Hello everyone in the meeting!' });
    const receivedMsg = await msgReceivedBy2;
    assert.equal(receivedMsg.text, 'Hello everyone in the meeting!');
    assert.equal(receivedMsg.senderName, 'user-1');

    // Client 3 connects later and joins the room
    const client3 = createClient(socketUrl, { transports: ['websocket'], reconnection: false });
    await new Promise((resolve, reject) => {
      client3.once('connect', resolve);
      client3.once('connect_error', reject);
    });

    const chatHistoryPromise = new Promise((resolve) => client3.once('room-chat-history', resolve));
    client3.emit('join-room', {
      roomId,
      user: { id: 'user-3', name: 'user-3' },
      accessToken: issueRoomAccessToken({
        roomId,
        participantId: 'user-3',
        displayName: 'user-3',
        role: 'participant',
      }),
    });

    const chatHistory = await chatHistoryPromise;
    assert.ok(Array.isArray(chatHistory.messages), 'messages should be an array');
    assert.equal(chatHistory.messages.length, 1);
    assert.equal(chatHistory.messages[0].text, 'Hello everyone in the meeting!');
    client3.disconnect();
  } finally {
    client1.disconnect();
    client2.disconnect();
    io.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('meeting archives are strictly isolated per account and never leak to newly logged in users', async () => {
  const app = await startApp();
  try {
    // 1. Register User 1
    const user1Email = `user1_${Date.now()}@syncmeet.ai`;
    const reg1 = await request(app.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'User One', email: user1Email, password: 'password123' },
    });
    assert.equal(reg1.response.status, 201);
    const token1 = reg1.data.token;
    assert.ok(token1, 'User 1 should have token');

    // 2. Register User 2 (new user)
    const user2Email = `user2_${Date.now()}@syncmeet.ai`;
    const reg2 = await request(app.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'User Two', email: user2Email, password: 'password123' },
    });
    assert.equal(reg2.response.status, 201);
    const token2 = reg2.data.token;
    assert.ok(token2, 'User 2 should have token');

    // 3. User 1 creates and archives a meeting
    const roomId = `room-${randomUUID()}`;
    const createRes = await request(app.baseUrl, '/api/rooms/create', {
      method: 'POST',
      bearerToken: token1,
      body: { roomId, title: 'Secret Executive Sync' },
    });
    assert.equal(createRes.response.status, 201);
    const hostToken = createRes.data.accessToken;

    const saveRes = await request(app.baseUrl, `/api/history/${roomId}/save`, {
      method: 'POST',
      token: hostToken,
      body: {
        transcripts: [
          { speaker: 'User One', text: 'Confidential strategy discussion', timestamp: '10:00 AM' },
        ],
        aiNotes: {
          summary: 'Confidential executive roadmap',
          decisions: ['Approve private acquisition'],
          actionItems: [],
          openQuestions: [],
        },
      },
    });
    assert.equal(saveRes.response.status, 201);

    // 4. User 1 checks recent history -> should see their meeting
    const history1 = await request(app.baseUrl, '/api/history/recent', {
      method: 'GET',
      bearerToken: token1,
    });
    assert.equal(history1.response.status, 200);
    assert.equal(history1.data.meetings.length, 1);
    assert.equal(history1.data.meetings[0].roomId, roomId);

    // 5. User 2 (new user) checks recent history -> MUST NOT see User 1's meeting!
    const history2 = await request(app.baseUrl, '/api/history/recent', {
      method: 'GET',
      bearerToken: token2,
    });
    assert.equal(history2.response.status, 200);
    assert.equal(history2.data.meetings.length, 0, 'New user 2 must not see any meetings from user 1');

    // 6. User 2 directly requests User 1's meeting archive -> MUST BE REJECTED with 404
    const accountArchive2 = await request(app.baseUrl, `/api/history/account/${roomId}`, {
      method: 'GET',
      bearerToken: token2,
    });
    assert.equal(accountArchive2.response.status, 404, 'User 2 cannot access User 1 meeting archive');
  } finally {
    await app.close();
  } 
});
