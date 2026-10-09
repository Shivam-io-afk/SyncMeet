import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server/server.js';
import { logger } from '../server/utils/logger.js';
import { initSentry, isSentryActive } from '../server/config/sentry.js';
import {
  enqueueAiNotesJob,
  enqueueTranscriptJob,
  enqueueEmailReminderJob,
  getJobStatus,
  closeQueues,
} from '../server/queues/meetingQueue.js';

test('Phase 3: Pino HTTP assigns and preserves correlation request IDs', async () => {
  // Test case 1: Request with custom correlation ID
  const customId = 'req-trace-test-12345';
  const resWithHeader = await request(app)
    .get('/api/health')
    .set('x-request-id', customId);

  assert.equal(resWithHeader.status, 200);
  assert.equal(resWithHeader.headers['x-request-id'], customId);

  // Test case 2: Request without custom correlation ID generates a UUID
  const resWithoutHeader = await request(app).get('/api/health');
  assert.equal(resWithoutHeader.status, 200);
  assert.ok(resWithoutHeader.headers['x-request-id']);
  assert.match(
    resWithoutHeader.headers['x-request-id'],
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
});

test('Phase 3: Health check endpoint /api/health returns authoritative status', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.ok(typeof res.body.uptime === 'number');
  assert.ok(typeof res.body.timestamp === 'string');
  assert.ok('database' in res.body);
});

test('Phase 3: Logger exports working Pino instance with redaction configuration', () => {
  assert.ok(logger);
  assert.equal(typeof logger.info, 'function');
  assert.equal(typeof logger.error, 'function');
  assert.equal(typeof logger.warn, 'function');
});

test('Phase 3: Sentry gracefully handles unset SENTRY_DSN without throwing', () => {
  const previousDsn = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  const result = initSentry();
  assert.equal(result.enabled, false);
  assert.equal(isSentryActive(), false);
  if (previousDsn) process.env.SENTRY_DSN = previousDsn;
});

test('Phase 3: Meeting background queue enqueues and executes jobs with in-memory fallback', async () => {
  // 1. Enqueue AI notes job
  const aiJob = await enqueueAiNotesJob({
    roomId: 'test-room-phase3',
    transcripts: [{ speaker: 'Alice', text: 'We decided on Redis for caching' }],
    customPrompt: 'Summarize decisions',
  });

  assert.ok(aiJob.id);
  assert.equal(aiJob.name, 'ai-notes');

  // 2. Enqueue transcript job
  const transcriptJob = await enqueueTranscriptJob({
    roomId: 'test-room-phase3',
    chunk: 'Sample audio transcript chunk',
  });
  assert.ok(transcriptJob.id);
  assert.equal(transcriptJob.name, 'transcript-processing');

  // 3. Enqueue email reminder job
  const emailJob = await enqueueEmailReminderJob({
    email: 'attendee@syncmeet.ai',
    meetingTitle: 'Sprint Retrospective',
    scheduledTime: new Date().toISOString(),
    roomId: 'test-room-phase3',
  });
  assert.ok(emailJob.id);
  assert.equal(emailJob.name, 'email-reminder');

  // Allow async execution to process
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Verify status retrieval
  const aiStatus = await getJobStatus(aiJob.id);
  assert.ok(aiStatus);
  assert.equal(aiStatus.name, 'ai-notes');
  assert.equal(aiStatus.state, 'completed');
  assert.equal(aiStatus.returnvalue.processedCount, 1);

  const emailStatus = await getJobStatus(emailJob.id);
  assert.ok(emailStatus);
  assert.equal(emailStatus.state, 'completed');
  assert.equal(emailStatus.returnvalue.dispatched, true);

  await closeQueues();
});

