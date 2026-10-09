import 'dotenv/config';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { AuthSession } from '../models/AuthSession.js';
import { User } from '../models/User.js';
import { isDbConnected } from '../config/db.js';
import { inMemoryAuthSessions, verifiedAccounts } from '../store/memoryMeetingStore.js';

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production' ? '' : 'local-development-only-change-before-deployment'
);

if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters in production');
}
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
if (!/^\d+[smhd]$/.test(ACCESS_TOKEN_TTL)) {
  throw new Error('JWT_ACCESS_EXPIRES_IN must be a duration such as 15m');
}

function readBearerToken(req) {
  const authorization = req.get('Authorization') || '';
  const match = authorization.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] || '';
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  if (
    !decoded
    || decoded.type !== 'access'
    || typeof decoded.id !== 'string'
    || !decoded.id
  ) {
    throw new Error('Invalid access token');
  }
  return decoded;
}

export async function protect(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized, token invalid or expired' });
  }

  if (process.env.NODE_ENV === 'production' && !isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Authentication database is unavailable' });
  }

  try {
    if (decoded.sid) {
      if (isDbConnected()) {
        const sessionExists = await AuthSession.exists({
          sessionId: decoded.sid,
          userId: decoded.id,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        });
        if (!sessionExists) {
          return res.status(401).json({ success: false, message: 'Session has expired or been revoked' });
        }
      } else {
        const activeSession = [...inMemoryAuthSessions.values()].some((session) => (
          session.sessionId === decoded.sid
          && session.userId === decoded.id
          && !session.revokedAt
          && session.expiresAt > new Date()
        ));
        if (!activeSession) {
          return res.status(401).json({ success: false, message: 'Session has expired or been revoked' });
        }
      }
    }

    if (isDbConnected()) {
      const user = await User.findById(decoded.id)
        .select('name email role avatar title avatarColor createdAt preferences')
        .lean();
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authenticated user no longer exists' });
      }
      req.user = { ...user, id: String(user._id) };
      return next();
    }

    const memoryUser = [...verifiedAccounts.values()].find((account) => String(account._id || account.id) === decoded.id)
      || (decoded.email ? verifiedAccounts.get(decoded.email.toLowerCase()) : null);

    req.user = memoryUser ? { ...memoryUser, id: String(memoryUser._id || memoryUser.id) } : {
      _id: decoded.id,
      id: decoded.id,
      name: decoded.name || 'User',
      email: decoded.email || 'user@syncmeet.ai',
      role: decoded.role || 'participant',
      avatar: decoded.avatar || '',
      title: decoded.title || '',
      avatarColor: decoded.avatarColor || '',
    };
    return next();
  } catch (error) {
    console.error('Authentication lookup failed:', error);
    return res.status(503).json({ success: false, message: 'Could not verify authenticated user' });
  }
}

export async function optionalProtect(req, res, next) {
  const token = readBearerToken(req);
  if (!token) return next();

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized, token invalid or expired' });
  }

  if (process.env.NODE_ENV === 'production' && !isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Authentication database is unavailable' });
  }

  try {
    if (decoded.sid) {
      if (isDbConnected()) {
        const sessionExists = await AuthSession.exists({
          sessionId: decoded.sid,
          userId: decoded.id,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        });
        if (!sessionExists) {
          return res.status(401).json({ success: false, message: 'Session has expired or been revoked' });
        }
      } else {
        const activeSession = [...inMemoryAuthSessions.values()].some((session) => (
          session.sessionId === decoded.sid
          && session.userId === decoded.id
          && !session.revokedAt
          && session.expiresAt > new Date()
        ));
        if (!activeSession) {
          return res.status(401).json({ success: false, message: 'Session has expired or been revoked' });
        }
      }
    }

    if (isDbConnected()) {
      const user = await User.findById(decoded.id)
        .select('name email role avatar title avatarColor createdAt preferences')
        .lean();
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authenticated user no longer exists' });
      }
      req.user = { ...user, id: String(user._id) };
    } else {
      const memoryUser = [...verifiedAccounts.values()].find((account) => String(account._id || account.id) === decoded.id)
        || (decoded.email ? verifiedAccounts.get(decoded.email.toLowerCase()) : null);

      req.user = memoryUser ? { ...memoryUser, id: String(memoryUser._id || memoryUser.id) } : {
        _id: decoded.id,
        id: decoded.id,
        name: decoded.name || 'User',
        email: decoded.email || 'user@syncmeet.ai',
        role: decoded.role || 'participant',
        avatar: decoded.avatar || '',
        title: decoded.title || '',
        avatarColor: decoded.avatarColor || '',
      };
    }
    return next();
  } catch (error) {
    console.error('Optional authentication lookup failed:', error);
    return res.status(503).json({ success: false, message: 'Could not verify authenticated user' });
  }
}

export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication is required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }
    return next();
  };
}

export function generateToken(user, sessionId) {
  const id = String(user._id || user.id);
  const claims = {
    id,
    jti: randomUUID(),
    type: 'access',
    role: user.role || 'participant',
  };
  if (sessionId) claims.sid = sessionId;
  if (process.env.NODE_ENV !== 'production' && !isDbConnected()) {
    claims.name = user.name;
    claims.email = user.email;
  }
  return jwt.sign(claims, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export { JWT_SECRET };
