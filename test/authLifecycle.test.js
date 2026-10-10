import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
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

    const duplicateRegistration = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Duplicate User', email, password: 'long-enough-password' }),
    });
    assert.equal(duplicateRegistration.response.status, 409);

    const profile = await request(baseUrl, '/api/auth/me', {
      headers: { Authorization: `Bearer ${registered.data.token}` },
    });
    assert.equal(profile.response.status, 200);
    assert.equal(profile.data.user.email, email);

    assert.equal((await request(baseUrl, '/api/auth/me')).response.status, 401);
    assert.equal((await request(baseUrl, '/api/auth/me', {
      headers: { Authorization: 'Bearer malformed-token' },
    })).response.status, 401);
    const secret = process.env.JWT_SECRET || 'local-development-only-change-before-deployment';
    const expiredToken = jwt.sign({
      id: 'expired-user',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) - 10,
    }, secret);
    assert.equal((await request(baseUrl, '/api/auth/me', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    })).response.status, 401);

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
    assert.equal((await request(baseUrl, '/api/auth/me', {
      headers: { Authorization: `Bearer ${refreshed.data.token}` },
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

test('unimplemented social providers never authenticate client-supplied identities', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const server = createAuthApp();
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const provider of ['github', 'microsoft']) {
      const result = await request(baseUrl, `/api/auth/${provider}`, {
        method: 'POST',
        body: JSON.stringify({
          email: `${provider}-${Date.now()}@example.test`,
          name: 'Unverified account',
          [`${provider}Id`]: 'forged-provider-id',
        }),
      });
      assert.equal(result.response.status, 501);
      assert.equal(result.data.success, false);
      assert.equal(result.data.message, 'This authentication provider is not configured');
      assert.equal(result.response.headers.has('set-cookie'), false);
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('Google OAuth kickoff binds state and applies production cookie protections', async () => {
  const keys = [
    'NODE_ENV',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL',
    'GOOGLE_FRONTEND_ORIGIN',
  ];
  const previousValues = new Map(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: 'production',
    GOOGLE_CLIENT_ID: 'qa-client-id',
    GOOGLE_CLIENT_SECRET: 'qa-client-secret',
    GOOGLE_CALLBACK_URL: 'https://api.example.test/api/auth/google/callback',
    GOOGLE_FRONTEND_ORIGIN: 'https://app.example.test',
  });
  const server = createAuthApp();
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    const authorizeUrl = new URL(response.headers.get('location'));
    assert.equal(authorizeUrl.origin, 'https://accounts.google.com');
    assert.equal(authorizeUrl.searchParams.get('redirect_uri'), 'https://api.example.test/api/auth/google/callback');
    const state = authorizeUrl.searchParams.get('state');
    assert.equal(typeof state, 'string');
    assert(state.length >= 40);
    const cookie = response.headers.get('set-cookie') || '';
    assert.match(cookie, /syncmeet_google_oauth_state=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert(cookie.includes(encodeURIComponent(state)));

    const rejectedCallback = await fetch(`${baseUrl}/api/auth/google/callback?state=wrong&code=not-used`);
    assert.equal(rejectedCallback.status, 200);
    assert.match(await rejectedCallback.text(), /Google sign-in could not be verified/);
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('production registration fails closed without the authentication database', async () => {
  const keys = ['NODE_ENV'];
  const previousValues = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = 'production';
  const server = createAuthApp();
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cookie Security Test',
        email: `refresh-cookie-${Date.now()}@example.test`,
        password: 'long-enough-password',
      }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).message, 'Authentication database is unavailable');
    assert.equal(response.headers.has('set-cookie'), false);
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
