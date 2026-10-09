import express from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { AuthSession } from '../models/AuthSession.js';
import { User } from '../models/User.js';
import { isDbConnected } from '../config/db.js';
import { generateToken, protect } from '../middleware/authMiddleware.js';
import { inMemoryAuthSessions, verifiedAccounts } from '../store/memoryMeetingStore.js';

const router = express.Router();
const REFRESH_COOKIE = 'syncmeet_refresh';
const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const refreshDuration = refreshExpiresIn.match(/^(\d+)([dh])$/);
if (!refreshDuration) {
  throw new Error('JWT_REFRESH_EXPIRES_IN must be a duration such as 7d or 24h');
}
const REFRESH_TTL_MS = Number(refreshDuration[1])
  * (refreshDuration[2] === 'd' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
const emailSchema = z.string().trim().email().max(254);
const registrationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: z.string().min(8).max(128),
}).strict();
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
}).strict();

function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function readRefreshCookie(req) {
  const prefix = `${REFRESH_COOKIE}=`;
  const value = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function setRefreshCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  const sameSite = secure ? 'None' : 'Lax';
  const domain = process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : '';
  res.append(
    'Set-Cookie',
    `${REFRESH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/api/auth; SameSite=${sameSite}; Max-Age=${Math.floor(REFRESH_TTL_MS / 1000)}${secure ? '; Secure' : ''}${domain}`
  );
}

function clearRefreshCookie(res) {
  const secure = process.env.NODE_ENV === 'production';
  const sameSite = secure ? 'None' : 'Lax';
  const domain = process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : '';
  res.append(
    'Set-Cookie',
    `${REFRESH_COOKIE}=; HttpOnly; Path=/api/auth; SameSite=${sameSite}; Max-Age=0${secure ? '; Secure' : ''}${domain}`
  );
}

function validateCookieRequestOrigin(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  const origin = req.get('Origin');
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!origin || !allowedOrigins.includes(origin)) {
    return res.status(403).json({ success: false, message: 'Request origin is not allowed' });
  }
  return next();
}

function publicUser(user) {
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar || '',
    title: user.title || '',
    avatarColor: user.avatarColor || '',
  };
}

async function createAuthSession(user, sessionId = randomUUID()) {
  const refreshToken = randomBytes(48).toString('base64url');
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const userId = String(user._id || user.id);
  if (isDbConnected()) {
    await AuthSession.create({ sessionId, userId, refreshTokenHash, expiresAt });
  } else {
    inMemoryAuthSessions.set(refreshTokenHash, {
      sessionId,
      userId,
      refreshTokenHash,
      expiresAt,
      revokedAt: null,
      replacedByHash: null,
    });
  }
  return {
    token: generateToken(user, sessionId),
    refreshToken,
    refreshTokenHash,
    sessionId,
    expiresAt,
  };
}

async function revokeSession(session) {
  const now = new Date();
  if (isDbConnected()) {
    await AuthSession.updateMany(
      { sessionId: session.sessionId, userId: session.userId, revokedAt: null },
      { $set: { revokedAt: now } }
    );
    return;
  }
  for (const record of inMemoryAuthSessions.values()) {
    if (record.sessionId === session.sessionId && record.userId === session.userId) {
      record.revokedAt = now;
    }
  }
}

async function revokeRefreshToken(token) {
  if (!token) return;
  const tokenHash = hashRefreshToken(token);
  if (isDbConnected()) {
    const session = await AuthSession.findOne({ refreshTokenHash: tokenHash })
      .select('+refreshTokenHash');
    if (session) await revokeSession(session);
    return;
  }
  const session = inMemoryAuthSessions.get(tokenHash);
  if (session) await revokeSession(session);
}

async function rotateRefreshToken(req, res) {
  const presentedToken = readRefreshCookie(req);
  if (!presentedToken) {
    return res.status(401).json({ success: false, message: 'A valid refresh session is required' });
  }
  if (process.env.NODE_ENV === 'production' && !isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Authentication database is unavailable' });
  }

  const presentedHash = hashRefreshToken(presentedToken);
  const oldSession = isDbConnected()
    ? await AuthSession.findOne({ refreshTokenHash: presentedHash }).select('+refreshTokenHash')
    : inMemoryAuthSessions.get(presentedHash);
  if (!oldSession) {
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: 'Refresh session is invalid or expired' });
  }

  if (oldSession.revokedAt || oldSession.expiresAt <= new Date()) {
    await revokeSession(oldSession);
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: 'Refresh session is invalid or expired' });
  }

  const user = isDbConnected()
    ? await User.findById(oldSession.userId).select('name email role avatar')
    : [...verifiedAccounts.values()].find((account) => String(account._id || account.id) === oldSession.userId);
  if (!user) {
    await revokeSession(oldSession);
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: 'Authenticated user no longer exists' });
  }

  const nextSession = await createAuthSession(user, oldSession.sessionId);
  let rotated = false;
  if (isDbConnected()) {
    const result = await AuthSession.updateOne(
      { _id: oldSession._id, revokedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { revokedAt: new Date(), replacedByHash: nextSession.refreshTokenHash } }
    );
    rotated = result.modifiedCount === 1;
  } else if (!oldSession.revokedAt) {
    oldSession.revokedAt = new Date();
    oldSession.replacedByHash = nextSession.refreshTokenHash;
    rotated = true;
  }

  if (!rotated) {
    await revokeRefreshToken(nextSession.refreshToken);
    await revokeSession(oldSession);
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: 'Refresh session was already used' });
  }

  setRefreshCookie(res, nextSession.refreshToken);
  return res.json({ success: true, token: nextSession.token, user: publicUser(user) });
}

function rejectDemoAuthentication(res) {
  if (process.env.NODE_ENV !== 'production') return false;
  res.status(501).json({
    success: false,
    message: 'This demo authentication provider is not configured for production',
  });
  return true;
}

// In-memory OTP storage: email -> { code, expiresAt }
const activeOtps = new Map();

function oauthPopupResponse(res, origin, payload) {
  const nonce = randomBytes(18).toString('base64');
  const safePayload = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const safeOrigin = JSON.stringify(origin);

  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'`,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  return res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Google sign-in</title></head>
<body><p>Returning to SyncMeet…</p><script nonce="${nonce}">
var payload = ${safePayload};
try {
  if (window.opener) window.opener.postMessage(payload, ${safeOrigin});
} catch (e) {}
try {
  var ch = new BroadcastChannel('syncmeet-google-auth');
  ch.postMessage(payload);
  ch.close();
} catch (e) {}
setTimeout(function () { window.close(); }, 150);
</script></body></html>`);
}

function getGoogleOAuthConfig() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL || process.env.GOOGLE_CALLBACK;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !redirectUri) {
    return null;
  }

  try {
    const callback = new URL(redirectUri);
    const frontend = new URL(process.env.GOOGLE_FRONTEND_ORIGIN || callback.origin);
    if (
      !['http:', 'https:'].includes(callback.protocol)
      || !['http:', 'https:'].includes(frontend.protocol)
      || (process.env.NODE_ENV === 'production'
        && (callback.protocol !== 'https:' || frontend.protocol !== 'https:'))
    ) {
      return null;
    }
    return {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri,
      frontendOrigin: frontend.origin,
    };
  } catch {
    return null;
  }
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  const encodedName = `${name}=`;
  const item = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(encodedName));
  return item ? item.slice(encodedName.length) : '';
}

function setOAuthStateCookie(res, state) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `syncmeet_google_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300${secure}`
  );
}

function clearOAuthStateCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `syncmeet_google_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

function statesMatch(expected, actual) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function getGoogleOAuthFailureMessage(error) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'The email address is linked to a different Google account') {
    return message;
  }
  if (message === 'Google token exchange failed with status 400') {
    return 'Google rejected the authorization response. Check that the authorized redirect URI exactly matches GOOGLE_CALLBACK_URL.';
  }
  if (process.env.NODE_ENV !== 'production' && message) {
    return `Google sign-in failed: ${message}`;
  }
  return 'Google sign-in failed. Please try again.';
}

// Helper to find or create social user
async function findOrCreateSocialUser(email, name, avatar, provider, providerId) {
  const normalizedEmail = email.toLowerCase().trim();

  if (isDbConnected()) {
    let user = provider === 'google' && providerId
      ? await User.findOne({ googleId: providerId })
      : null;
    if (!user) user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = await User.create({
        name,
        email: normalizedEmail,
        password: randomBytes(32).toString('hex'),
        avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
        role: 'participant',
        ...(provider === 'google' && providerId ? { googleId: providerId } : {}),
      });
    } else if (provider === 'google' && providerId && !user.googleId) {
      user.googleId = providerId;
      await user.save();
    }
    if (provider === 'google' && providerId && user.googleId && user.googleId !== providerId) {
      throw new Error('The email address is linked to a different Google account');
    }
    if (provider === 'google' && user.email !== normalizedEmail) {
      user.email = normalizedEmail;
      user.name = name;
      if (avatar) user.avatar = avatar;
      await user.save();
    }
    const session = await createAuthSession(user);
    return { ...session, user: publicUser(user) };
  }

  // In-memory verified accounts
  let user = verifiedAccounts.get(normalizedEmail);
  if (!user) {
    user = {
      _id: `usr_${provider}_${Date.now()}`,
      id: `usr_${provider}_${Date.now()}`,
      name,
      email: normalizedEmail,
      role: 'participant',
      avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
      createdAt: new Date(),
      ...(provider === 'google' && providerId ? { googleId: providerId } : {}),
    };
    verifiedAccounts.set(normalizedEmail, user);
  }

  const session = await createAuthSession(user);
  return { ...session, user: publicUser(user) };
}

// @route   POST /api/auth/register
// @desc    Register a new authenticated user
// @access  Public
router.post('/register', async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      success: false,
      message: 'Provide a valid name, email, and password of at least 8 characters',
    });
  }
  const { name, password } = parsed.data;

  if (process.env.NODE_ENV === 'production' && !isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Authentication database is unavailable' });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();

  try {
    if (isDbConnected()) {
      const userExists = await User.findOne({ email: normalizedEmail });
      if (userExists) {
        return res.status(409).json({ success: false, message: 'An account with this email already exists' });
      }

      const user = await User.create({
        name,
        email: normalizedEmail,
        password,
        role: 'participant',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
      });

      const session = await createAuthSession(user);
      setRefreshCookie(res, session.refreshToken);
      return res.status(201).json({
        success: true,
        token: session.token,
        user: publicUser(user),
      });
    }

    if (verifiedAccounts.has(normalizedEmail)) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const id = `usr_${Date.now()}`;
    const newUser = {
      _id: id,
      id,
      name,
      email: normalizedEmail,
      passwordHash,
      role: 'participant',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
      createdAt: new Date(),
    };

    verifiedAccounts.set(normalizedEmail, newUser);
    const session = await createAuthSession(newUser);
    setRefreshCookie(res, session.refreshToken);

    return res.status(201).json({
      success: true,
      token: session.token,
      user: publicUser(newUser),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate registered user with email & password
// @access  Public
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ success: false, message: 'Provide a valid email and password' });
  }
  const { password } = parsed.data;

  if (process.env.NODE_ENV === 'production' && !isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Authentication database is unavailable' });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();

  try {
    if (isDbConnected()) {
      const user = await User.findOne({ email: normalizedEmail }).select('+password');
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const session = await createAuthSession(user);
      setRefreshCookie(res, session.refreshToken);
      return res.json({
        success: true,
        token: session.token,
        user: publicUser(user),
      });
    }

    // In-Memory Verified Account Lookup
    const user = verifiedAccounts.get(normalizedEmail);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const session = await createAuthSession(user);
    setRefreshCookie(res, session.refreshToken);
    return res.json({
      success: true,
      token: session.token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

router.post('/refresh', validateCookieRequestOrigin, rotateRefreshToken);

router.post('/logout', validateCookieRequestOrigin, async (req, res) => {
  try {
    await revokeRefreshToken(readRefreshCookie(req));
    clearRefreshCookie(res);
    return res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    clearRefreshCookie(res);
    return res.status(500).json({ success: false, message: 'Could not end the session' });
  }
});

router.post('/logout-all', protect, async (req, res) => {
  try {
    const userId = String(req.user.id || req.user._id);
    if (isDbConnected()) {
      await AuthSession.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    } else {
      for (const session of inMemoryAuthSessions.values()) {
        if (session.userId === userId) session.revokedAt = new Date();
      }
    }
    clearRefreshCookie(res);
    return res.json({ success: true });
  } catch (error) {
    console.error('Logout all error:', error);
    return res.status(500).json({ success: false, message: 'Could not end all sessions' });
  }
});

// @route   GET /api/auth/google
// @desc    Start Google OAuth authorization-code flow
router.get('/google', (req, res) => {
  const config = getGoogleOAuthConfig();
  if (!config) {
    return res.status(503).send('Google sign-in is not configured correctly on the server.');
  }
  const state = randomBytes(32).toString('base64url');
  setOAuthStateCookie(res, state);
  const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizeUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString();
  return res.redirect(authorizeUrl.toString());
});

// @route   GET /api/auth/google/callback
// @desc    Exchange Google's authorization code and create an app session
router.get('/google/callback', async (req, res) => {
  const config = getGoogleOAuthConfig();
  if (!config) {
    return res.status(503).send('Google sign-in is not configured correctly on the server.');
  }
  clearOAuthStateCookie(res);
  const stateCookie = getCookie(req, 'syncmeet_google_oauth_state');
  if (!statesMatch(stateCookie, req.query.state)) {
    return oauthPopupResponse(res, config.frontendOrigin, {
      type: 'syncmeet-google-auth',
      error: 'Google sign-in could not be verified. Please try again.',
    });
  }
  if (req.query.error) {
    return oauthPopupResponse(res, config.frontendOrigin, {
      type: 'syncmeet-google-auth',
      error: 'Google sign-in was cancelled or denied.',
    });
  }
  if (typeof req.query.code !== 'string') {
    return oauthPopupResponse(res, config.frontendOrigin, {
      type: 'syncmeet-google-auth',
      error: 'Google did not return an authorization code.',
    });
  }
  if (process.env.NODE_ENV === 'production' && !isDbConnected()) {
    return oauthPopupResponse(res, config.frontendOrigin, {
      type: 'syncmeet-google-auth',
      error: 'Sign-in is temporarily unavailable because the account database is offline.',
    });
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenResponse.ok) {
      throw new Error(`Google token exchange failed with status ${tokenResponse.status}`);
    }
    const tokens = await tokenResponse.json();
    if (typeof tokens.access_token !== 'string') {
      throw new Error('Google token response did not include an access token');
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!profileResponse.ok) {
      throw new Error(`Google profile verification failed with status ${profileResponse.status}`);
    }
    const profile = await profileResponse.json();
    if (
      typeof profile.sub !== 'string'
      || typeof profile.email !== 'string'
      || profile.email_verified !== true
    ) {
      throw new Error('Google did not return a verified account identity');
    }

    const result = await findOrCreateSocialUser(
      profile.email,
      typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : profile.email.split('@')[0],
      typeof profile.picture === 'string' ? profile.picture : '',
      'google',
      profile.sub
    );
    setRefreshCookie(res, result.refreshToken);
    return oauthPopupResponse(res, config.frontendOrigin, {
      type: 'syncmeet-google-auth',
      token: result.token,
      user: result.user,
    });
  } catch (err) {
    console.error('Google OAuth callback failed:', {
      name: err.name,
      code: err.code,
      message: err.message,
    });
    return oauthPopupResponse(res, config.frontendOrigin, {
      type: 'syncmeet-google-auth',
      error: getGoogleOAuthFailureMessage(err),
    });
  }
});

// @route   POST /api/auth/github
router.post('/github', async (req, res) => {
  if (rejectDemoAuthentication(res)) return;
  const { email, name, avatar, githubId } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'GitHub account email is required' });
  }
  try {
    const result = await findOrCreateSocialUser(email, name || 'GitHub Developer', avatar, 'github', githubId);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('GitHub auth error:', err);
    return res.status(500).json({ success: false, message: 'GitHub authentication failed' });
  }
});

// @route   POST /api/auth/microsoft
router.post('/microsoft', async (req, res) => {
  if (rejectDemoAuthentication(res)) return;
  const { email, name, avatar, microsoftId } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Microsoft account email is required' });
  }
  try {
    const result = await findOrCreateSocialUser(email, name || 'Microsoft User', avatar, 'microsoft', microsoftId);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Microsoft auth error:', err);
    return res.status(500).json({ success: false, message: 'Microsoft authentication failed' });
  }
});

// @route   POST /api/auth/otp/send
// @desc    Generate and send 6-digit verification code to email
router.post('/otp/send', async (req, res) => {
  if (rejectDemoAuthentication(res)) return;
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Valid email address is required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  activeOtps.set(normalizedEmail, { code, expiresAt });
  console.log(`🔑 [OTP] Code for ${normalizedEmail}: ${code}`);

  return res.json({
    success: true,
    message: `Verification code sent to ${normalizedEmail}`,
    devCode: code,
  });
});

// @route   POST /api/auth/otp/verify
// @desc    Verify 6-digit code and authenticate user
router.post('/otp/verify', async (req, res) => {
  if (rejectDemoAuthentication(res)) return;
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'Email and verification code are required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const record = activeOtps.get(normalizedEmail);

  if (!record || record.code !== code || Date.now() > record.expiresAt) {
    if (code !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }
  }

  activeOtps.delete(normalizedEmail);
  const result = await findOrCreateSocialUser(normalizedEmail, normalizedEmail.split('@')[0], '', 'email_otp', 'otp');
  return res.json({ success: true, ...result });
});

// @route   GET /api/auth/me
// @desc    Get authenticated user profile
// @access  Private
router.get('/me', protect, async (req, res) => {
  return res.json({
    success: true,
    user: publicUser(req.user),
  });
});

// @route   PUT /api/auth/profile
// @desc    Update authenticated user profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  const { name, title, avatarColor, avatar } = req.body || {};
  const updates = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
      return res.status(400).json({ success: false, message: 'Display name must be between 1 and 80 characters' });
    }
    updates.name = name.trim();
  }

  if (title !== undefined) {
    if (typeof title !== 'string' || title.length > 100) {
      return res.status(400).json({ success: false, message: 'Title must be 100 characters or fewer' });
    }
    updates.title = title.trim();
  }

  if (avatarColor !== undefined) {
    if (typeof avatarColor !== 'string' || avatarColor.length > 100) {
      return res.status(400).json({ success: false, message: 'Avatar color must be 100 characters or fewer' });
    }
    updates.avatarColor = avatarColor.trim();
  }

  if (avatar !== undefined) {
    if (typeof avatar !== 'string' || avatar.length > 500) {
      return res.status(400).json({ success: false, message: 'Avatar URL must be 500 characters or fewer' });
    }
    updates.avatar = avatar.trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid profile fields provided for update' });
  }

  try {
    const userId = String(req.user.id || req.user._id);

    if (isDbConnected()) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        { returnDocument: 'after', runValidators: true }
      ).select('name email role avatar title avatarColor createdAt preferences');

      if (!updatedUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return res.json({
        success: true,
        user: publicUser(updatedUser),
      });
    }

    // In-memory update
    const memoryUser = verifiedAccounts.get(req.user.email?.toLowerCase());
    if (memoryUser) {
      Object.assign(memoryUser, updates);
    }
    const updated = {
      ...req.user,
      ...updates,
    };

    return res.json({
      success: true,
      user: publicUser(updated),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Could not update profile' });
  }
});

export default router;
