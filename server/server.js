import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { connectDB, isDbConnected } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import meetingFeatureRoutes from './routes/meetingFeatureRoutes.js';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedisClient, getRedisSubscriber } from './store/memoryMeetingStore.js';
import { setupSocketHandlers } from './socket/socketHandler.js';
import { logger, httpLogger } from './utils/logger.js';
import { initSentry, captureException } from './config/sentry.js';
import { initializeQueue, closeQueues } from './queues/meetingQueue.js';

dotenv.config();
initSentry();
initializeQueue();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0)) {
      return callback(null, true);
    }
    return callback(null, allowedOrigins.includes(origin));
  },
};

// Initialize Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const pubClient = getRedisClient();
const subClient = getRedisSubscriber();
if (pubClient && subClient) {
  io.adapter(createAdapter(pubClient, subClient));
  logger.info('⚡ [Socket.io] Redis adapter attached for multi-instance pub/sub');
}

// Middlewares
app.disable('x-powered-by');
app.use(httpLogger);
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '2mb', parameterLimit: 100 }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT_MAX) || 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
const authenticationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
});
app.use('/api', apiLimiter);
app.use('/api/auth', authenticationLimiter);

function healthCheck(_req, res) {
  const databaseConnected = isDbConnected();
  const isReady = process.env.NODE_ENV !== 'production' || databaseConnected;
  return res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ok' : 'degraded',
    app: 'SyncMeet AI Real-Time Production Server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      connected: databaseConnected,
    },
  });
}
app.get(['/health', '/api/health'], healthCheck);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/features', meetingFeatureRoutes);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  captureException(error, { path: req.path, method: req.method, reqId: req.id });
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body exceeds the 2MB limit' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Request body must contain valid JSON' });
  }
  logger.error({
    err: error,
    name: error.name,
    code: error.code,
    path: req.path,
    reqId: req.id,
  }, 'Unhandled API request error');
  return res.status(500).json({ success: false, message: 'An unexpected server error occurred' });
});

// Setup Socket.io Event Handlers
setupSocketHandlers(io);

// Production Static Assets serving (if built)
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA client-side routing (Express 5 compatible)
app.use((req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('SyncMeet AI Server is running. Start client with npm run dev.');
    }
  });
});

const PORT = process.env.PORT || 5000;

export async function startServer() {
  await connectDB();
  initializeQueue();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, () => {
      server.off('error', reject);
      resolve();
    });
  });
  logger.info(`SyncMeet API listening on port ${PORT}`);
}

let shutdownPromise;
export function shutdownServer(signal = 'shutdown') {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    logger.info(`Shutting down SyncMeet after ${signal}`);
    const forceExitTimer = setTimeout(() => process.exit(1), 10_000);
    forceExitTimer.unref();
    try {
      await new Promise((resolve) => io.close(resolve));
      await closeQueues();
      await mongoose.disconnect();
      process.exitCode = 0;
    } finally {
      clearTimeout(forceExitTimer);
    }
  })();
  return shutdownPromise;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error('Could not start SyncMeet API:', error.name);
    process.exitCode = 1;
  });
  process.once('SIGINT', () => shutdownServer('SIGINT'));
  process.once('SIGTERM', () => shutdownServer('SIGTERM'));
}

export { app, server, io };
