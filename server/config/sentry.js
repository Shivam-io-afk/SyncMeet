import * as Sentry from '@sentry/node';
import { logger } from '../utils/logger.js';

let isSentryEnabled = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || typeof dsn !== 'string' || !dsn.trim()) {
    return { enabled: false };
  }

  try {
    Sentry.init({
      dsn: dsn.trim(),
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      beforeSend(event) {
        if (event.request?.headers) {
          if (event.request.headers.authorization) {
            event.request.headers.authorization = '[REDACTED]';
          }
          if (event.request.headers.cookie) {
            event.request.headers.cookie = '[REDACTED]';
          }
        }
        if (event.request?.data && typeof event.request.data === 'object') {
          const sensitiveKeys = ['password', 'token', 'refreshToken', 'accessToken', 'secret'];
          for (const key of Object.keys(event.request.data)) {
            if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
              event.request.data[key] = '[REDACTED]';
            }
          }
        }
        return event;
      },
    });

    isSentryEnabled = true;
    logger.info('🛡️ [Sentry] Backend error monitoring initialized');
    return { enabled: true };
  } catch (error) {
    logger.error('Failed to initialize Sentry:', error);
    return { enabled: false, error: error.message };
  }
}

export function captureException(error, context = {}) {
  if (isSentryEnabled) {
    Sentry.captureException(error, { extra: context });
  } else {
    logger.error({ err: error, context }, 'Exception captured (Sentry disabled)');
  }
}

export function isSentryActive() {
  return isSentryEnabled;
}

