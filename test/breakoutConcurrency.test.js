import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import http from 'node:http';
import mongoose from 'mongoose';
import { test } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, isDbConnected } from '../server/config/db.js';
import { BreakoutSession } from '../server/models/BreakoutSession.js';
import { issueRoomAccessToken } from '../server/middleware/roomAccessMiddleware.js';
import featureRoutes from '../server/routes/meetingFeatureRoutes.js';

test('concurrent Mongo breakout creation leaves exactly one active session', { timeout: 30_000 }, async () => {
  const mongoOptions = process.env.MONGOMS_SYSTEM_BINARY
    ? { binary: { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } }
    : {};
  const mongo = await MongoMemoryServer.create(mongoOptions);
  const app = express();
  app.use(express.json());
  app.use('/api/features', featureRoutes);
  const server = http.createServer(app);
  const roomId = `breakout-concurrency-${randomUUID()}`;
  const previousMongoUri = process.env.MONGODB_URI;

  try {
    process.env.MONGODB_URI = mongo.getUri();
    assert.equal(await connectDB(), true);
    assert.equal(isDbConnected(), true);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const accessToken = issueRoomAccessToken({
      roomId,
      participantId: 'concurrency-test-host',
      displayName: 'Concurrency Test Host',
      role: 'host',
    });
    const url = `http://127.0.0.1:${server.address().port}/api/features/rooms/${roomId}/breakouts`;
    const body = JSON.stringify({
      groups: [
        { name: 'Room A', participantIds: [] },
        { name: 'Room B', participantIds: [] },
      ],
    });
    const responses = await Promise.all(Array.from({ length: 12 }, () => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Room-Access-Token': accessToken,
      },
      body,
    })));
    const statuses = responses.map((response) => response.status);
    assert.equal(statuses.filter((status) => status === 201).length, 1);
    assert.equal(statuses.filter((status) => status === 409).length, 11);
    assert.equal(await BreakoutSession.countDocuments({ roomId, status: 'active' }), 1);
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (previousMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousMongoUri;
    await mongo.stop();
  }
});

test('Mongo startup fails closed and preserves pre-existing duplicate active breakouts', { timeout: 30_000 }, async () => {
  const mongoOptions = process.env.MONGOMS_SYSTEM_BINARY
    ? { binary: { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } }
    : {};
  const mongo = await MongoMemoryServer.create(mongoOptions);
  const roomId = `breakout-duplicate-existing-${randomUUID()}`;
  const previousMongoUri = process.env.MONGODB_URI;
  const client = new mongoose.mongo.MongoClient(mongo.getUri());

  try {
    await client.connect();
    const collection = client.db('test').collection(BreakoutSession.collection.collectionName);
    await collection.insertMany([
      { id: randomUUID(), roomId, status: 'active', groups: [] },
      { id: randomUUID(), roomId, status: 'active', groups: [] },
    ]);
    await client.close();

    process.env.MONGODB_URI = mongo.getUri();
    assert.equal(await connectDB(), false);
    assert.equal(isDbConnected(), false);

    await client.connect();
    const preservedRows = await client.db('test')
      .collection(BreakoutSession.collection.collectionName)
      .countDocuments({ roomId, status: 'active' });
    assert.equal(preservedRows, 2);
  } finally {
    if (client.topology?.isConnected()) await client.close();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (previousMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousMongoUri;
    await mongo.stop();
  }
});
