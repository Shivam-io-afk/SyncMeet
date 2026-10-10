# Architecture Decisions & Dependency Log

This document records architectural decisions, technical justifications, and dependency choices for the SyncMeet AI backend improvement.

---

## Phase 0: Safety Net Dependencies

| Package                 | Version | Type              | One-Line Justification                                                                                                         |
| :---------------------- | :------ | :---------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `eslint`                | pinned  | `devDependencies` | Static code analysis to enforce code quality, clean standards, and prevent syntax/scoping regressions.                         |
| `prettier`              | pinned  | `devDependencies` | Opinionated automated code formatting to ensure consistency across JavaScript and JSX files.                                   |
| `supertest`             | pinned  | `devDependencies` | HTTP assertion library allowing characterization testing of Express endpoints without manually managing ports.                 |
| `mongodb-memory-server` | pinned  | `devDependencies` | In-memory MongoDB instance for fast, isolated, deterministic database integration tests without external network dependencies. |
| `@playwright/test`      | pinned  | `devDependencies` | Cross-browser multi-context end-to-end automation for verifying host/participant real-time WebRTC and UI lifecycles.           |

## Phase 1: Core Bug & Real-Time Presence Dependencies

| Package                    | Version | Type           | One-Line Justification                                                                                               |
| :------------------------- | :------ | :------------- | :------------------------------------------------------------------------------------------------------------------- |
| `ioredis`                  | `6.0.0` | `dependencies` | High-performance Redis client for real-time presence caching, host lease management, and reconnection grace windows. |
| `@socket.io/redis-adapter` | `8.3.0` | `dependencies` | Socket.IO adapter enabling horizontal multi-instance pub/sub and synchronized room broadcasts across server nodes.   |

## Phase 3: Observability, Background Jobs, Containerization & CI Dependencies

| Package         | Version  | Type           | One-Line Justification                                                                                             |
| :-------------- | :------- | :------------- | :----------------------------------------------------------------------------------------------------------------- |
| `pino`          | `10.4.0` | `dependencies` | High-throughput structured JSON logging with minimal overhead and automated credential redaction.                  |
| `pino-http`     | `11.0.0` | `dependencies` | Express HTTP middleware generating and propagating request correlation IDs (`x-request-id`).                       |
| `@sentry/node`  | `11.6.0` | `dependencies` | Backend error telemetry and distributed exception monitoring with header and payload sanitization.                 |
| `@sentry/react` | `11.6.0` | `dependencies` | Client-side React exception capturing and performance monitoring with authorization token sanitization.            |
| `bullmq`        | `6.3.12` | `dependencies` | Background queue for asynchronous AI notes, transcripts, and reminder emails with retries, timeouts, and fallback. |

---

## Architectural Principles & Rules

1. **Database as Single Source of Truth**:
   MongoDB Atlas is the canonical store for all persistent meeting data (rooms, users, sessions, attendance, polls, Q&A, breakouts, agendas, notes).
2. **Ephemeral / Presence Cache**:
   Redis (via `ioredis` with an in-memory fallback for local dev without `REDIS_URL`) manages fast real-time presence, reconnect grace period timers, and Socket.IO cluster broadcast adapters.
3. **Production Container Boundaries**:
   Docker Compose requires managed MongoDB and Redis URLs, a production JWT secret, and exact CORS origins instead of shipping default credentials or unauthenticated data services. The app port binds to loopback by default behind a TLS-terminating reverse proxy.
4. **Zero `localStorage` Policy**:
   No meeting-scoped state or tokens may be stored in `localStorage`. Meeting session state lives exclusively in `sessionStorage` and is validated against authoritative server state.
5. **Stable Identity Over Socket ID**:
   All participants, video tiles, and attendance records are keyed by stable `userId` (or persistent guest ID), never ephemeral `socket.id`.
6. **Correlation ID & Observability**:
   Every HTTP request and Socket event carries a request correlation ID (`x-request-id`) logged through Pino and transmitted in response headers.
7. **Graceful Degraded Mode**:
   Background queues (BullMQ), presence stores (Redis), and AI APIs (Gemini) must support seamless local in-memory fallbacks when external cloud dependencies are absent.
8. **Least Privilege Containerization**:
   Docker runtime runs as unprivileged `node` user with multi-stage compilation and automated healthcheck probes.
