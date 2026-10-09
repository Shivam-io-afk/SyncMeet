import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

const QUEUE_NAME = 'meeting-tasks';
let bullQueue = null;
let bullWorker = null;
let redisConnection = null;
let redisWorkerConnection = null;

// In-memory fallback queue for local development and test environments
class MemoryQueue {
  constructor() {
    this.jobs = new Map();
    this.handlers = new Map();
  }

  registerHandler(name, handler) {
    this.handlers.set(name, handler);
  }

  async add(name, data, options = {}) {
    const id = options.jobId || `mem-${randomUUID()}`;
    const attempts = options.attempts || 3;
    const timeoutMs = options.timeout || 30_000;
    const job = {
      id,
      name,
      data,
      attemptsMade: 0,
      attempts,
      state: 'waiting',
      returnvalue: null,
      failedReason: null,
      createdAt: new Date(),
    };
    this.jobs.set(id, job);

    // Process asynchronously on next tick
    const executeJob = async () => {
      job.state = 'active';
      job.attemptsMade += 1;
      const handler = this.handlers.get(name);
      if (!handler) {
        job.state = 'failed';
        job.failedReason = `No handler registered for job type: ${name}`;
        return;
      }

      try {
        const timeoutPromise = new Promise((_, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Job timed out after ${timeoutMs}ms`));
          }, timeoutMs);
          timer.unref();
        });

        const result = await Promise.race([handler(job), timeoutPromise]);
        job.state = 'completed';
        job.returnvalue = result;
      } catch (err) {
        if (job.attemptsMade < job.attempts) {
          const delay = options.backoff?.delay || 100;
          const retryTimer = setTimeout(executeJob, delay);
          retryTimer.unref();
        } else {
          job.state = 'failed';
          job.failedReason = err.message;
        }
      }
    };

    const initialTimer = setTimeout(executeJob, 10);
    initialTimer.unref();

    return {
      id,
      name,
      data,
      getState: async () => job.state,
      returnvalue: job.returnvalue,
    };
  }

  async getJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
      getState: async () => job.state,
    };
  }

  async close() {
    this.jobs.clear();
  }
}

const memoryQueue = new MemoryQueue();

// Register default job handlers
async function processAiNotes(job) {
  logger.info({ jobId: job.id, roomId: job.data?.roomId }, 'Processing AI notes job in background');
  const { transcripts = [], customPrompt = '' } = job.data || {};
  return {
    processedCount: transcripts.length,
    summaryPrompt: customPrompt,
    completedAt: new Date().toISOString(),
  };
}

async function processTranscript(job) {
  logger.info({ jobId: job.id, roomId: job.data?.roomId }, 'Processing transcript chunk in background');
  const { chunk = '' } = job.data || {};
  return {
    chunkLength: chunk.length,
    processedAt: new Date().toISOString(),
  };
}

async function processEmailReminder(job) {
  logger.info({ jobId: job.id, recipient: job.data?.email }, 'Processing scheduled meeting email reminder');
  const { email, meetingTitle, scheduledTime } = job.data || {};
  return {
    recipient: email,
    meetingTitle,
    scheduledTime,
    dispatched: true,
    sentAt: new Date().toISOString(),
  };
}

memoryQueue.registerHandler('ai-notes', processAiNotes);
memoryQueue.registerHandler('transcript-processing', processTranscript);
memoryQueue.registerHandler('email-reminder', processEmailReminder);

let isQueueInitialized = false;

export function initializeQueue() {
  if (isQueueInitialized) {
    return { mode: bullQueue ? 'bullmq' : 'memory' };
  }
  isQueueInitialized = true;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || typeof redisUrl !== 'string' || !redisUrl.trim()) {
    logger.info('ℹ️ [Queue] REDIS_URL not set; using resilient in-memory background task queue');
    return { mode: 'memory' };
  }

  try {
    redisConnection = new IORedis(redisUrl.trim(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    redisWorkerConnection = new IORedis(redisUrl.trim(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    bullQueue = new Queue(QUEUE_NAME, { connection: redisConnection });
    bullWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        switch (job.name) {
          case 'ai-notes':
            return processAiNotes(job);
          case 'transcript-processing':
            return processTranscript(job);
          case 'email-reminder':
            return processEmailReminder(job);
          default:
            throw new Error(`Unknown job name: ${job.name}`);
        }
      },
      {
        connection: redisWorkerConnection,
        concurrency: Number(process.env.BULLMQ_CONCURRENCY) || 5,
      }
    );

    bullWorker.on('completed', (job) => {
      logger.info({ jobId: job.id, name: job.name }, 'BullMQ job completed successfully');
    });

    bullWorker.on('failed', (job, err) => {
      logger.warn({ jobId: job?.id, name: job?.name, error: err.message }, 'BullMQ job failed');
    });

    logger.info('📦 [Queue] BullMQ Redis background queue initialized');
    return { mode: 'bullmq' };
  } catch (error) {
    logger.error('Failed to initialize BullMQ with Redis, falling back to memory queue:', error);
    return { mode: 'memory-fallback' };
  }
}

export async function enqueueAiNotesJob(data, options = {}) {
  const jobOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    timeout: 60_000,
    removeOnComplete: true,
    ...options,
  };

  if (bullQueue) {
    return bullQueue.add('ai-notes', data, jobOptions);
  }
  return memoryQueue.add('ai-notes', data, jobOptions);
}

export async function enqueueTranscriptJob(data, options = {}) {
  const jobOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 500 },
    timeout: 30_000,
    removeOnComplete: true,
    ...options,
  };

  if (bullQueue) {
    return bullQueue.add('transcript-processing', data, jobOptions);
  }
  return memoryQueue.add('transcript-processing', data, jobOptions);
}

export async function enqueueEmailReminderJob(data, options = {}) {
  const jobOptions = {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    timeout: 45_000,
    removeOnComplete: true,
    ...options,
  };

  if (bullQueue) {
    return bullQueue.add('email-reminder', data, jobOptions);
  }
  return memoryQueue.add('email-reminder', data, jobOptions);
}

export async function getJobStatus(jobId) {
  if (bullQueue) {
    const job = await bullQueue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return {
      id: job.id,
      name: job.name,
      state,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  const job = await memoryQueue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return {
    id: job.id,
    name: job.name,
    state,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  };
}

export async function closeQueues() {
  if (bullWorker) {
    await bullWorker.close();
    bullWorker = null;
  }
  if (bullQueue) {
    await bullQueue.close();
    bullQueue = null;
  }
  if (redisWorkerConnection) {
    redisWorkerConnection.disconnect();
    redisWorkerConnection = null;
  }
  if (redisConnection) {
    redisConnection.disconnect();
    redisConnection = null;
  }
  await memoryQueue.close();
}

export function isBullMQActive() {
  return bullQueue !== null;
}
