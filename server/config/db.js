import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

let connectionAttempt;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn(process.env.NODE_ENV === 'production'
      ? 'MongoDB is not configured; production readiness and account authentication are unavailable.'
      : 'MongoDB is not configured; using the in-memory development store.');
    return false;
  }
  if (mongoose.connection.readyState === 1) return true;
  if (connectionAttempt) return connectionAttempt;

  connectionAttempt = mongoose.connect(uri, {
    appName: 'SyncMeet',
    maxPoolSize: 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
  }).then((conn) => {
    console.info('MongoDB connected', {
      host: conn.connection.host,
      database: conn.connection.name,
    });
    return dropLegacyAttendanceIndex().then(() => true);
  }).catch((error) => {
    console.warn('MongoDB connection unavailable; using the in-memory development store.', {
      error: error.name,
    });
    return false;
  }).finally(() => {
    connectionAttempt = null;
  });

  return connectionAttempt;
}

// An older schema enforced one attendance row per {roomId, userId}, which made every
// reload/rejoin (new socket id) fail with a duplicate-key error.
async function dropLegacyAttendanceIndex() {
  try {
    await mongoose.connection.collection('meetingattendances').dropIndex('roomId_1_userId_1');
    console.info('Dropped legacy meetingattendances index roomId_1_userId_1');
  } catch (error) {
    if (error?.codeName !== 'IndexNotFound' && error?.codeName !== 'NamespaceNotFound' && error?.code !== 27 && error?.code !== 26) {
      console.warn('Could not drop legacy attendance index', { error: error.message });
    }
  }
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB connection was lost');
});
mongoose.connection.on('reconnected', () => {
  console.info('MongoDB connection restored');
});

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
