import assert from 'node:assert/strict';
import express from 'express';
import { test } from 'node:test';
import authRoutes from '../server/routes/authRoutes.js';

function createAuthApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app.listen(0, '127.0.0.1');
}

function refreshCookie(response) {
  const value = response.headers.get('set-cookie')?.match(/syncmeet_refresh=([^;]*)/)?.[1];
  assert.ok(value, 'response should set the HttpOnly refresh cookie');
  return `syncmeet_refresh=${value}`;
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return { response, data: await response.json() };
}

test('auth lifecycle validates registration, rotates refresh cookies, and revokes sessions', async () => {
  const server = createAuthApp();
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const email = `auth-${Date.now()}@example.test`;
  try {
    const invalid = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test User', email, password: 'short' }),
    });
    assert.equal(invalid.response.status, 422);

    const registered = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test User', email, password: 'long-enough-password' }),
    });
    assert.equal(registered.response.status, 201);
    assert.equal(typeof registered.data.token, 'string');
    assert.equal(Object.hasOwn(registered.data.user, 'password'), false);
    const firstCookie = refreshCookie(registered.response);

    const profile = await request(baseUrl, '/api/auth/me', {
      headers: { Authorization: `Bearer ${registered.data.token}` },
    });
    assert.equal(profile.response.status, 200);
    assert.equal(profile.data.user.email, email);

    const refreshed = await request(baseUrl, '/api/auth/refresh', {
      method: 'POST',
      headers: { Cookie: firstCookie },
    });
    assert.equal(refreshed.response.status, 200);
    assert.notEqual(refreshed.data.token, registered.data.token);
    const rotatedCookie = refreshCookie(refreshed.response);

    const replayed = await request(baseUrl, '/api/auth/refresh', {
      method: 'POST',
      headers: { Cookie: firstCookie },
    });
    assert.equal(replayed.response.status, 401);

    const revokedProfile = await request(baseUrl, '/api/auth/me', {
      headers: { Authorization: `Bearer ${refreshed.data.token}` },
    });
    assert.equal(revokedProfile.response.status, 401);

    const login = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'long-enough-password' }),
    });
    assert.equal(login.response.status, 200);
    const loginCookie = refreshCookie(login.response);

    const logoutAll = await request(baseUrl, '/api/auth/logout-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.data.token}` },
    });
    assert.equal(logoutAll.response.status, 200);
    assert.equal((await request(baseUrl, '/api/auth/me', {
      headers: { Authorization: `Bearer ${login.data.token}` },
    })).response.status, 401);

    const revokedAllRefresh = await request(baseUrl, '/api/auth/refresh', {
      method: 'POST',
      headers: { Cookie: loginCookie },
    });

    assert.equal(revokedAllRefresh.response.status, 401);

    const anotherLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'long-enough-password' }),
    });
    assert.equal(anotherLogin.response.status, 200);
    const anotherCookie = refreshCookie(anotherLogin.response);
    const logout = await request(baseUrl, '/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: anotherCookie },
    });
    assert.equal(logout.response.status, 200);
    assert.equal((await request(baseUrl, '/api/auth/refresh', {
      method: 'POST',
      headers: { Cookie: anotherCookie },
    })).response.status, 401);
    assert.ok(rotatedCookie);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('login rejects invalid credentials without revealing which field failed', async () => {
  const server = createAuthApp();
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'missing@example.test', password: 'long-enough-password' }),
    });
    assert.equal(result.response.status, 401);
    assert.equal(result.data.message, 'Invalid email or password');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
