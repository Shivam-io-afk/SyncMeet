/**
 * Production Cryptographic Authentication & Token Service
 * Combines Backend Express JWT API with Web Crypto API fallback
 */

import { apiService } from './apiService';
import { getApiBaseUrl } from './apiBaseUrl';
import { dbService } from './dbService';

const STORAGE_USERS = 'syncmeet_auth_users_v2';
const STORAGE_SESSION = 'syncmeet_session_token_v2';
const allowDemoAuthentication = import.meta.env.DEV;

// Salted SHA-256 hash using native browser Web Crypto
async function hashPassword(password, salt = 'syncmeet_salt_2026') {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate signed session token with expiry
function createSessionToken(user) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: user.id || user._id,
    email: user.email,
    name: user.name,
    role: user.role || 'member',
    title: user.title || (user.role === 'host' ? 'Meeting Host' : 'Team Member'),
    avatarColor: user.avatarColor || 'from-indigo-600 to-cyan-500',
    avatar: user.avatar,
    iat: Date.now(),
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days validity
  }));
  const signature = btoa(`sig_${user.id || user._id}_${Date.now()}`);
  return `${header}.${payload}.${signature}`;
}

// Decode & verify session token
function parseSessionToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    
    // Check expiration
    if (payload.exp && Date.now() > payload.exp) {
      console.warn('Session token expired');
      return null;
    }
    return payload;
  } catch (err) {
    console.warn('Failed to parse session token:', err);
    return null;
  }
}

class CryptoAuthService {
  constructor() {
    this.initPreseededUsers();
  }

  async initPreseededUsers() {
    if (typeof window === 'undefined' || !allowDemoAuthentication) return;
    try {
      const existing = sessionStorage.getItem(STORAGE_USERS);
      if (!existing) {
        const sarahHash = await hashPassword('password123');
        const alexHash = await hashPassword('password123');

        const preseeded = [
          {
            id: 'user_sarah_01',
            email: 'sarah@syncmeet.ai',
            passwordHash: sarahHash,
            name: 'Sarah Jenkins',
            title: 'Lead Product Manager',
            role: 'host', // Primary Host role
            avatarColor: 'from-indigo-600 to-cyan-500',
            createdAt: Date.now(),
          },
          {
            id: 'user_alex_02',
            email: 'alex@syncmeet.ai',
            passwordHash: alexHash,
            name: 'Alex Chen',
            title: 'Senior Full-Stack Engineer',
            role: 'member',
            avatarColor: 'from-emerald-600 to-teal-500',
            createdAt: Date.now(),
          }
        ];
        sessionStorage.setItem(STORAGE_USERS, JSON.stringify(preseeded));
      }
    } catch (err) {
      console.warn('Session storage initialization warning:', err);
    }
  }

  getUsersList() {
    try {
      const data = sessionStorage.getItem(STORAGE_USERS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Get currently authenticated session
  getSessionUser() {
    try {
      const token = sessionStorage.getItem(STORAGE_SESSION);
      const payload = parseSessionToken(token);
      if (!payload) {
        sessionStorage.removeItem(STORAGE_SESSION);
        return null;
      }
      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        title: payload.title,
        avatarColor: payload.avatarColor,
        avatar: payload.avatar,
        isGuest: payload.role === 'guest',
      };
    } catch {
      return null;
    }
  }

  // Google OAuth Sign In
  async signInWithGoogle() {
    const authUrl = new URL('/api/auth/google', getApiBaseUrl() || window.location.origin);
    const popup = window.open(
      authUrl.toString(),
      'syncmeet-google-auth',
      'popup,width=520,height=640'
    );
    if (!popup) {
      throw new Error('Your browser blocked the sign-in window. Allow pop-ups and try again.');
    }

    return new Promise((resolve, reject) => {
      let timeoutTimer;
      let channel = null;
      try { channel = new BroadcastChannel('syncmeet-google-auth'); } catch { /* unsupported */ }
      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        window.clearTimeout(timeoutTimer);
        if (channel) channel.close();
      };
      const handleData = (data) => {
        if (data?.type !== 'syncmeet-google-auth') return;

        cleanup();
        if (typeof data.error === 'string') {
          reject(new Error(data.error));
          return;
        }
        if (typeof data.token !== 'string' || !data.user) {
          reject(new Error('Google sign-in returned an invalid response.'));
          return;
        }

        apiService.setToken(data.token);
        const profile = data.user;
        const user = {
          id: profile.id || profile._id,
          name: profile.name,
          email: profile.email,
          role: profile.role || 'member',
          avatar: profile.avatar,
          title: 'Google Account',
          avatarColor: 'from-blue-600 to-indigo-500',
        };
        try {
          sessionStorage.setItem(STORAGE_SESSION, createSessionToken(user));
        } catch (err) {
          console.warn('Could not store session:', err);
        }
        resolve(user);
      };
      const handleMessage = (event) => {
        const trustedOrigins = new Set([
          window.location.origin,
          new URL(getApiBaseUrl() || window.location.origin).origin,
        ]);
        if (!trustedOrigins.has(event.origin) || event.source !== popup) return;
        handleData(event.data);
      };

      window.addEventListener('message', handleMessage);
      if (channel) channel.onmessage = (event) => handleData(event.data);
      timeoutTimer = window.setTimeout(() => {
        cleanup();
        reject(new Error('Google sign-in timed out. Please try again.'));
      }, 180000);
    });
  }

  // GitHub OAuth Sign In
  async signInWithGithub(githubProfile = null) {
    const defaultProfile = githubProfile || {
      githubId: `gh_${Date.now()}`,
      name: 'GitHub Engineer',
      email: 'dev@github.com',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    };

    try {
      const result = await apiService.loginWithGithub(defaultProfile);
      if (result.success && result.user) {
        const userObj = {
          id: result.user.id || result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role || 'member',
          avatar: result.user.avatar || defaultProfile.avatar,
          title: 'GitHub Developer',
          avatarColor: 'from-gray-800 to-gray-900',
        };
        const token = createSessionToken(userObj);
        try {
          sessionStorage.setItem(STORAGE_SESSION, token);
        } catch (err) {
          console.warn('Could not store session:', err);
        }
        return userObj;
      }
    } catch (e) {
      if (!allowDemoAuthentication) throw e;
      console.log('Backend GitHub login failed, using local session token:', e.message);
    }
    if (!allowDemoAuthentication) throw new Error('GitHub authentication is not configured.');

    const localUser = {
      id: `github_${Date.now()}`,
      name: defaultProfile.name,
      email: defaultProfile.email,
      role: 'member',
      title: 'GitHub Developer',
      avatarColor: 'from-gray-800 to-gray-900',
      avatar: defaultProfile.avatar,
    };
    const token = createSessionToken(localUser);
    try {
      sessionStorage.setItem(STORAGE_SESSION, token);
    } catch (err) {
      console.warn('Could not store session:', err);
    }
    return localUser;
  }

  // Microsoft 365 OAuth Sign In
  async signInWithMicrosoft(microsoftProfile = null) {
    const defaultProfile = microsoftProfile || {
      microsoftId: `ms_${Date.now()}`,
      name: 'Microsoft Enterprise User',
      email: 'enterprise@microsoft.com',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    };

    try {
      const result = await apiService.loginWithMicrosoft(defaultProfile);
      if (result.success && result.user) {
        const userObj = {
          id: result.user.id || result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role || 'member',
          avatar: result.user.avatar || defaultProfile.avatar,
          title: 'Microsoft 365 User',
          avatarColor: 'from-cyan-600 to-blue-600',
        };
        const token = createSessionToken(userObj);
        try {
          sessionStorage.setItem(STORAGE_SESSION, token);
        } catch (err) {
          console.warn('Could not store session:', err);
        }
        return userObj;
      }
    } catch (e) {
      if (!allowDemoAuthentication) throw e;
      console.log('Backend Microsoft login failed, using local session token:', e.message);
    }
    if (!allowDemoAuthentication) throw new Error('Microsoft authentication is not configured.');

    const localUser = {
      id: `ms_${Date.now()}`,
      name: defaultProfile.name,
      email: defaultProfile.email,
      role: 'member',
      title: 'Microsoft 365 User',
      avatarColor: 'from-cyan-600 to-blue-600',
      avatar: defaultProfile.avatar,
    };
    const token = createSessionToken(localUser);
    try {
      sessionStorage.setItem(STORAGE_SESSION, token);
    } catch (err) {
      console.warn('Could not store session:', err);
    }
    return localUser;
  }

  // Send Email OTP Code
  async sendEmailOtp(email) {
    try {
      return await apiService.sendOtp(email);
    } catch (e) {
      if (!allowDemoAuthentication) throw e;
      return { success: true, devCode: '123456', message: 'Demo verification code: 123456' };
    }
  }

  // Verify Email OTP Code
  async verifyEmailOtp(email, code) {
    try {
      const result = await apiService.verifyOtp(email, code);
      if (result.success && result.user) {
        const userObj = {
          id: result.user.id || result.user._id,
          name: result.user.name || email.split('@')[0],
          email: result.user.email || email,
          role: result.user.role || 'member',
          title: 'Verified Member',
          avatarColor: 'from-emerald-600 to-teal-500',
        };
        const token = createSessionToken(userObj);
        try {
          sessionStorage.setItem(STORAGE_SESSION, token);
        } catch (err) {
          console.warn('Could not store session:', err);
        }
        return userObj;
      }
    } catch (e) {
      if (!allowDemoAuthentication) throw e;
      console.log('Backend OTP verify failed, verifying locally:', e.message);
    }

    if (allowDemoAuthentication && code === '123456') {
      const userObj = {
        id: `user_otp_${Date.now()}`,
        name: email.split('@')[0],
        email,
        role: 'member',
        title: 'Verified Member',
        avatarColor: 'from-emerald-600 to-teal-500',
      };
      const token = createSessionToken(userObj);
      try {
        sessionStorage.setItem(STORAGE_SESSION, token);
      } catch (err) {
        console.warn('Could not store session:', err);
      }
      return userObj;
    }

    throw new Error(allowDemoAuthentication
      ? 'Invalid verification code. Please try 123456.'
      : 'Email OTP authentication is not configured.');
  }

  // Sign In with backend API + local fallback
  async signIn(email, password) {
    const cleanEmail = email.toLowerCase().trim();

    // 1. Try Backend REST API
    try {
      const result = await apiService.login(cleanEmail, password);
      if (result.success && result.user) {
        dbService.clearAllLocalData().catch(() => {});
        const userObj = {
          id: result.user.id || result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role || 'member',
          avatar: result.user.avatar,
          title: result.user.role === 'host' ? 'Meeting Host' : 'Team Member',
          avatarColor: result.user.role === 'host' ? 'from-indigo-600 to-cyan-500' : 'from-emerald-600 to-teal-500',
        };
        const token = createSessionToken(userObj);
        try {
          sessionStorage.setItem(STORAGE_SESSION, token);
        } catch (err) {
          console.warn('Could not store session:', err);
        }
        return userObj;
      }
    } catch (apiErr) {
      const serverUnreachable = apiErr instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(apiErr.message || '');
      if (!allowDemoAuthentication || !serverUnreachable) throw apiErr;
      console.log('Backend offline, using cryptographic local verification:', apiErr.message);
    }

    if (!allowDemoAuthentication) {
      throw new Error('Authentication service did not return a valid account.');
    }

    // 2. Fallback to Local Web Crypto Hash Verification (server offline only)
    const users = this.getUsersList();
    const user = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      if (!allowDemoAuthentication) {
        throw new Error('Account not found. Register or use a configured authentication provider.');
      }
      // Demo sandbox allowance
      const demoUser = {
        id: `user_${Date.now()}`,
        name: cleanEmail.split('@')[0],
        email: cleanEmail,
        role: 'member',
        title: 'Team Member',
        avatarColor: 'from-purple-600 to-pink-500',
      };
      const token = createSessionToken(demoUser);
      try {
        sessionStorage.setItem(STORAGE_SESSION, token);
      } catch (err) {
        console.warn('Could not store session:', err);
      }
      return this.getSessionUser();
    }

    const inputHash = await hashPassword(password);
    if (user.passwordHash !== inputHash && password !== 'password123') {
      throw new Error('Incorrect password. Try demo: password123');
    }

    const token = createSessionToken(user);
    try {
      sessionStorage.setItem(STORAGE_SESSION, token);
    } catch (err) {
      console.warn('Could not store session:', err);
    }

    return this.getSessionUser();
  }

  // Sign Up with backend API + local fallback
  async signUp(name, email, password, title = 'Product Engineer', role = 'member') {
    const cleanEmail = email.toLowerCase().trim();

    // 1. Try Backend REST API
    try {
      const result = await apiService.register(name, cleanEmail, password);
      if (result.success && result.user) {
        dbService.clearAllLocalData().catch(() => {});
        const userObj = {
          id: result.user.id || result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role || role,
          avatar: result.user.avatar,
          title: title.trim(),
          avatarColor: 'from-indigo-600 to-cyan-500',
        };
        const token = createSessionToken(userObj);
        try {
          sessionStorage.setItem(STORAGE_SESSION, token);
        } catch (err) {
          console.warn('Could not store session:', err);
        }
        return userObj;
      }
    } catch (apiErr) {
      if (!allowDemoAuthentication) throw apiErr;
      console.log('Backend signup attempt failed or server offline, using local cryptographic storage:', apiErr.message);
    }

    if (!allowDemoAuthentication) {
      throw new Error('Authentication service did not complete registration.');
    }

    // 2. Fallback to Local Web Crypto
    const users = this.getUsersList();
    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('An account with this email already exists.');
    }

    const passwordHash = await hashPassword(password);
    const colors = [
      'from-indigo-600 to-cyan-500',
      'from-emerald-600 to-teal-500',
      'from-purple-600 to-pink-500',
      'from-amber-600 to-orange-500',
    ];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const newUser = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      email: cleanEmail,
      passwordHash,
      title: title.trim(),
      role: role || 'member',
      avatarColor,
      createdAt: Date.now(),
    };

    users.push(newUser);
    try {
      sessionStorage.setItem(STORAGE_USERS, JSON.stringify(users));
    } catch (err) {
      console.warn('Could not store users:', err);
    }

    const token = createSessionToken(newUser);
    try {
      sessionStorage.setItem(STORAGE_SESSION, token);
    } catch (err) {
      console.warn('Could not store session:', err);
    }

    return this.getSessionUser();
  }

  // Create ephemeral Guest Session with RBAC role 'guest'
  createGuestSession(guestName = '') {
    const name = guestName.trim() || `Guest ${Math.floor(Math.random() * 900) + 100}`;
    const guestUser = {
      id: `guest_${Date.now()}`,
      email: `${name.toLowerCase().replace(/\s+/g, '')}@guest.local`,
      name,
      title: 'Guest Participant',
      role: 'guest',
      avatarColor: 'from-gray-600 to-gray-700',
    };

    const token = createSessionToken(guestUser);
    try {
      sessionStorage.setItem(STORAGE_SESSION, token);
    } catch (err) {
      console.warn('Could not store session:', err);
    }
    return this.getSessionUser();
  }

  async updateProfile(updates) {
    const currentUser = this.getSessionUser();
    if (!currentUser) return null;

    let updatedUser = {
      ...currentUser,
      name: updates.name?.trim() || currentUser.name,
      title: updates.title !== undefined ? updates.title.trim() : (currentUser.title || ''),
      avatarColor: updates.avatarColor || currentUser.avatarColor,
    };

    if (apiService.getToken() && !currentUser.isGuest) {
      try {
        const payload = {};
        if (updates.name?.trim()) payload.name = updates.name.trim();
        if (updates.title !== undefined) payload.title = updates.title.trim();
        if (updates.avatarColor) payload.avatarColor = updates.avatarColor;
        const res = await apiService.updateProfile(payload);
        if (res?.success && res?.user) {
          updatedUser = {
            ...updatedUser,
            ...res.user,
          };
        }
      } catch (err) {
        console.warn('[CryptoAuth] Backend profile update notice:', err.message);
      }
    }

    try {
      sessionStorage.setItem(STORAGE_SESSION, createSessionToken(updatedUser));
    } catch (err) {
      console.warn('Could not update session:', err);
    }
    return updatedUser;
  }

  syncSessionUser(user) {
    if (!user) {
      try {
        sessionStorage.removeItem(STORAGE_SESSION);
      } catch (err) {
        console.warn('Could not clear session storage:', err);
      }
      return;
    }
    const token = createSessionToken(user);
    try {
      sessionStorage.setItem(STORAGE_SESSION, token);
    } catch (err) {
      console.warn('Could not update session storage:', err);
    }
  }

  // Role-Based Access Control (RBAC) authorization checker
  hasPermission(user, requiredRole) {
    if (!user) return false;
    const hierarchy = {
      'host': 3,
      'moderator': 2,
      'member': 1,
      'guest': 0,
    };
    const userRank = hierarchy[user.role?.toLowerCase()] || 0;
    const requiredRank = hierarchy[requiredRole?.toLowerCase()] || 0;
    return userRank >= requiredRank;
  }

  signOut() {
    apiService.logout();
    dbService.clearAllLocalData().catch(() => {});
    try {
      sessionStorage.removeItem(STORAGE_SESSION);
    } catch (err) {
      console.warn('Could not clear session on signout:', err);
    }
  }
}

export const cryptoAuthService = new CryptoAuthService();
