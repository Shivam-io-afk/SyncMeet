import Redis from 'ioredis';

/**
 * SyncMeet AI Redis & In-Memory Hybrid Store
 * 
 * Provides synchronized presence, reconnect grace period management,
 * and meeting cache with fallback to local memory when REDIS_URL is not configured.
 */

let redisClient = null;
let redisSubscriber = null;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times) {
        return Math.min(times * 100, 2000);
      },
    });

    redisClient.on('connect', () => {
      console.log('⚡ [Redis] Connected successfully to Redis server');
    });

    redisClient.on('error', (err) => {
      console.warn('⚠️ [Redis] Connection warning:', err.message);
    });
  } catch (error) {
    console.warn('⚠️ [Redis] Could not instantiate Redis client, using memory fallback:', error.message);
    redisClient = null;
  }
} else {
  console.log('ℹ️ [Store] REDIS_URL not set; using local in-memory presence and store layer');
}

export function getRedisClient() {
  return redisClient;
}

export function getRedisSubscriber() {
  if (!redisClient) return null;
  if (!redisSubscriber) {
    redisSubscriber = redisClient.duplicate();
  }
  return redisSubscriber;
}

/**
 * Redis-backed Map proxy that implements standard JavaScript Map methods
 * with synchronous memory caching and write-through to Redis when available.
 */
class RedisBackedMap extends Map {
  constructor(namespace) {
    super();
    this.namespace = namespace;
  }

  set(key, value) {
    super.set(key, value);
    if (redisClient && redisClient.status === 'ready') {
      const redisKey = `syncmeet:${this.namespace}:${key}`;
      try {
        redisClient.set(redisKey, JSON.stringify(value)).catch((err) => {
          console.warn(`[Redis] Failed write-through for ${redisKey}:`, err.message);
        });
      } catch (err) {
        console.warn(`[Redis] Error serializing key ${redisKey}:`, err.message);
      }
    }
    return this;
  }

  delete(key) {
    const deleted = super.delete(key);
    if (redisClient && redisClient.status === 'ready') {
      const redisKey = `syncmeet:${this.namespace}:${key}`;
      redisClient.del(redisKey).catch((err) => {
        console.warn(`[Redis] Failed delete for ${redisKey}:`, err.message);
      });
    }
    return deleted;
  }

  clear() {
    super.clear();
    if (redisClient && redisClient.status === 'ready') {
      redisClient.keys(`syncmeet:${this.namespace}:*`).then((keys) => {
        if (keys.length > 0) redisClient.del(...keys);
      }).catch((err) => {
        console.warn(`[Redis] Failed clear for ${this.namespace}:`, err.message);
      });
    }
  }
}

// Map instances for server modules
export const inMemoryRooms = new RedisBackedMap('rooms');
export const scheduledMeetings = new RedisBackedMap('scheduledMeetings');
export const inMemoryHistory = new RedisBackedMap('history');
export const inMemoryMeetingAttendance = new RedisBackedMap('attendance');
export const inMemoryAuthSessions = new RedisBackedMap('authSessions');
export const roomPolls = new RedisBackedMap('polls');
export const roomQuestions = new RedisBackedMap('questions');
export const roomAgendas = new RedisBackedMap('agendas');
export const breakoutSessions = new RedisBackedMap('breakouts');

// Pre-seeded verified accounts for demo / testing
export const verifiedAccounts = new Map([
  [
    'sarah@syncmeet.ai',
    {
      _id: 'usr_sarah_01',
      id: 'usr_sarah_01',
      name: 'Sarah Jenkins',
      email: 'sarah@syncmeet.ai',
      passwordHash: '$2b$10$Gm1gmNdu.2Cf.pBCA3tDfOi1yUNGQ0hgpIF/iR4nwxbZil.eaOiB2',
      role: 'host',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      title: 'Meeting Host',
      avatarColor: 'from-[#ff8586] to-[#d85e77]',
      createdAt: new Date(),
    }
  ],
  [
    'alex@syncmeet.ai',
    {
      _id: 'usr_alex_02',
      id: 'usr_alex_02',
      name: 'Alex Chen',
      email: 'alex@syncmeet.ai',
      passwordHash: '$2b$10$Gm1gmNdu.2Cf.pBCA3tDfOi1yUNGQ0hgpIF/iR4nwxbZil.eaOiB2',
      role: 'participant',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      title: 'Product Engineer',
      avatarColor: 'from-emerald-600 to-teal-500',
      createdAt: new Date(),
    }
  ],
  [
    'elena@syncmeet.ai',
    {
      _id: 'usr_elena_03',
      id: 'usr_elena_03',
      name: 'Elena Rostova',
      email: 'elena@syncmeet.ai',
      passwordHash: '$2a$10$wN31V8kE6M7tZq2y1lP7A.d1iH2J3K4L5M6N7O8P9Q0R1S2T3U4V',
      role: 'participant',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      title: 'UX Researcher',
      avatarColor: 'from-purple-600 to-pink-500',
      createdAt: new Date(),
    }
  ],
  [
    'david@syncmeet.ai',
    {
      _id: 'usr_david_04',
      id: 'usr_david_04',
      name: 'David Kim',
      email: 'david@syncmeet.ai',
      passwordHash: '$2a$10$wN31V8kE6M7tZq2y1lP7A.d1iH2J3K4L5M6N7O8P9Q0R1S2T3U4V',
      role: 'participant',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      title: 'Security Lead',
      avatarColor: 'from-blue-600 to-cyan-500',
      createdAt: new Date(),
    }
  ],
]);
