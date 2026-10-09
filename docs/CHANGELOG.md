# Changelog

All notable changes to the SyncMeet AI backend project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - `backend-improve`

### Phase 0: Safety Net

- **Added**:
  - Pinned devDependencies: `eslint`, `prettier`, `supertest`, `mongodb-memory-server`, `@playwright/test`.
  - `/docs/CONTRACT.md`: Comprehensive mapping of all REST endpoints, Socket.IO client/server events, payloads, and DB collections.
  - `/docs/DECISIONS.md`: Architectural decision records and dependency justifications.
  - Characterization test suite in `test/characterization.test.js` validating baseline behavior of auth, room creation, joining, attendance logging, and meeting conclusion.
- **Changed**:
  - Updated `package.json` with scripts: `lint`, `lint:fix`, `format`, `test:e2e`.
- **Fixed**:
  - Documented complete defect catalog in `/docs/BUGS.md`.

### Phase 1: Core Bug Fixes - Reload, Rejoin, Presence & Identity Synchronization

- **Added**:
  - Redis presence integration with `ioredis` and `@socket.io/redis-adapter` for scalable multi-instance pub/sub and distributed room caching with graceful local memory fallback.
  - `GET /api/rooms/:roomId/state`: Authoritative REST room state query endpoint for rehydrating caller role, room lock status, participants, and active breakout sessions upon page reload or network rejoin.
  - Automated integration test suite `test/rejoinAndStateSync.test.js` covering stable participant IDs, state endpoint authorization, disconnection grace windows, reconnect socket replacement, and attendance deduplication.
  - Multi-context browser E2E test `e2e/reloadRejoin.spec.js` asserting host & participant video tiles persist across page refresh.
- **Changed**:
  - Replaced plain Maps in `server/store/memoryMeetingStore.js` with `RedisBackedMap` providing persistent write-through synchronization to Redis with local memory fallback.
  - Updated `server/models/MeetingAttendance.js` compound unique index to `{ roomId: 1, userId: 1 }` to prevent duplicate attendance records on reconnect.
  - Updated `server/routes/roomRoutes.js` `POST /api/rooms/:roomId/join` to preserve stable authenticated `userId` for non-host participants rather than assigning random `guest-` IDs.
  - Implemented 20-second reconnection grace period in `server/socket/socketHandler.js`:
    - Disconnecting socket emits `user-disconnected` instead of instantly removing the participant or broadcasting `user-left`.
    - If participant reconnects within grace window, server swaps socket ID, clears timeout, and emits `user-reconnected`.
    - If grace period expires or meeting ends, attendance is finalized and `user-left` is emitted.
    - Added `leave-room` socket event for intentional exit, immediately finalizing attendance without a grace window.
  - Updated frontend:
    - `src/services/apiService.js`: Added `getRoomState(roomId)`.
    - `src/services/socketService.js`: Emits `leave-room` before disconnecting.
    - `src/hooks/useWebRTC.js`: Handles `user-reconnected` event to replace old WebRTC peer connections.
    - `src/components/meeting/MeetingRoom.jsx`: Keyed video tiles by `peer.user?.id || peer.socketId` to avoid duplicate ghost tiles.
    - `src/App.jsx`: On mount, calls `getRoomState(roomId)` to rehydrate meeting state before reconnecting socket.
- **Fixed**:
  - BUG-001 (Participant disappears on page reload).
  - BUG-002 (Missing REST state endpoint).
  - BUG-003 (Duplicate attendance records on rejoin).
  - BUG-004 (Non-host authenticated users assigned random guest IDs).
  - BUG-005 (Video tile keying duplicate ghost tiles).
  - BUG-006 (Meeting-scoped session storage lifecycle).
  - BUG-007 (In-memory presence and MongoDB desynchronization).

### Phase 2: Feature-by-Feature Hardening

- **Added**:
  - Attached `@socket.io/redis-adapter` to Socket.IO engine in `server/server.js` when Redis is configured for distributed cluster pub/sub.
  - Added `DELETE /api/features/rooms/:roomId/polls/:pollId` restricted strictly to the meeting host.
  - Added `DELETE /api/features/rooms/:roomId/questions/:questionId` allowing deletion by either the original author or the meeting host.
  - Added Socket.IO real-time event broadcasts for `meeting-poll-deleted` and `meeting-question-deleted`.
  - Added 5-minute timeout and automatic timer unreferencing for pending waiting-room knock requests in `server/socket/socketHandler.js` to prevent memory leaks and hanging background events.
  - Unreferenced disconnection grace period timers (`timer.unref()`) to prevent Node.js event-loop hangs during tests and graceful shutdowns.
  - Automated test suite `test/phase2Hardening.test.js` validating question/poll deletion permissions, error statuses, and socket event broadcasts.
- **Changed**:
  - Cleaned up unused destructured variables in `server/routes/meetingFeatureRoutes.js` and `server/socket/socketHandler.js`.
  - Updated `package.json` `check:server` script to include `test/phase2Hardening.test.js`.
