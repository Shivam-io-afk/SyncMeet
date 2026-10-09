import pino from 'pino';
import { pinoHttp } from 'pino-http';
import crypto from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : (isProduction ? 'info' : 'debug')),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["set-cookie"]',
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      '*.password',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export const httpLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const existingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    const id = existingId || crypto.randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel(_req, res, err) {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} -> ${res.statusCode}`;
  },
  customErrorMessage(req, res, err) {
    return `${req.method} ${req.url} failed with ${res.statusCode}: ${err?.message || 'Unknown error'}`;
  },
  autoLogging: !isTest,
});
