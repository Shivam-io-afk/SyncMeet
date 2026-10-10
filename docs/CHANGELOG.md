# Changelog

All notable changes to the SyncMeet AI backend project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - `backend-improve`

### Card Component Redesign & Visual Hierarchy Alignment

- **Design System & Theme Tokens**:
  - Configured `sync.*` design tokens in `tailwind.config.js`: Page Background (`#08090B`), Primary Card (`#15171D`), Participant Tile (`#202023`), Primary Text (`#F5F5F5`), Secondary Text (`#A7AFBD`), Accent Green (`#B8F58A`), and subtle border `rgba(255, 255, 255, 0.09)`.
  - Added organic dark metallic silk wave backdrop via `<BackgroundSilkWaves />` to `DeviceSetup` and `MeetingRoom`.
- **Hero Video & Participant Cards (`VideoTile.jsx` & `VideoGrid.jsx`)**:
  - Differentiated Hero Video Card (`isSpotlight=true`): 26–30px rounded corners, thin lime-green border (`#B8F58A`) with soft ambient hover glow, bottom gradient vignette for text legibility, clean white typography display name at bottom-left, and discreet audio indicator.
  - Redesigned Participant Cards (`isSpotlight=false`): Dark charcoal background (`#202023`), 16–18px rounded corners, muted mic indicator in the top-left, centered avatars or video feeds with `object-cover`, display name along bottom-left, and active speaker border in `#B8F58A`.
  - Responsive layout in `VideoGrid.jsx` aligning secondary participants into a clean 4:3 ratio row under the spotlight feed.
- **Meeting Setup Page (`DeviceSetup.jsx`)**:
  - Updated Welcome/Setup card, tabs, input fields, recent meetings panel, and quick overview card to `#15171D` with subtle borders and `#B8F58A` active accents.
  - Video preview card upgraded with the hero rounded styling, bottom gradient, and floating liquid control dock.
- **Meeting Room Layout & Header Bar (`MeetingRoom.jsx` & `HeaderBar.jsx`)**:
  - Deep `#08090B` stage backdrop with silk waves and responsive toolbar docking.
  - Header bar and side navigation surfaces aligned to charcoal `#12141A` / `#15171D` surfaces.

### Production Readiness

- **Fixed**:
  - Removed the missing `public/` directory from the Docker build and exposed Vite's public build settings as build arguments.
  - Removed the checked-in production JWT secret and publicly exposed unauthenticated MongoDB/Redis services; Compose now requires managed service URLs and secrets and binds the API to loopback by default.
- **Added**:
  - CI installs Chromium and runs Playwright against the isolated production build and temporary MongoDB.
  - `npm run test:e2e:isolated` safely runs the production browser suite without targeting the configured application database.

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

### Backend Logic Hardening & Reliability Sweep

- **Fixed**:
  - `server/config/db.js`: Corrected `dropLegacyAttendanceIndex()` to target the 3-field index `roomId_1_userId_1_socketId_1` rather than attempting to drop the active compound unique index `roomId_1_userId_1`.
  - `server/middleware/roomAccessMiddleware.js`: Explicitly locked `jwt.verify` to `algorithms: ['HS256']` in `verifyRoomAccessToken` to prevent algorithm confusion attacks.
  - `server/routes/roomRoutes.js`: In `POST /api/rooms/:roomId/join`, added fallback to `req.user?.name` if `req.body.name` is omitted by authenticated users.
  - `server/routes/historyRoutes.js`: In `POST /api/history/:roomId/save`, updated host query on `Room.updateOne` to match `{ roomId, $or: [{ hostId: participantId }, { hostId: accountId }] }`.
  - `server/socket/socketHandler.js`: Wrapped `join-room` with top-level `try/catch` emitting `room-join-error` on unhandled exceptions to prevent socket crash/desync.

### Phase 3: Observability, Background Jobs, Containerization & CI

- **Added**:
  - `server/utils/logger.js`: High-performance structured JSON logging with `pino` and HTTP request tracing with `pino-http`. Automatic request ID generation/preservation (`x-request-id`) and header/credential redaction.
  - `server/config/sentry.js`: Centralized Sentry error monitoring on the backend with sensitive header and payload sanitization, activated only when `SENTRY_DSN` is configured.
  - `src/main.jsx`: Client-side `@sentry/react` monitoring with token and header redaction, activated only when `VITE_SENTRY_DSN` is configured.
  - `server/queues/meetingQueue.js`: Distributed background queue with BullMQ for asynchronous AI note generation, transcript batch processing, and scheduled meeting email reminders. Complete with exponential backoff retries, timeouts, and local in-memory fallback.
  - `server/routes/aiRoutes.js`: Added `POST /api/ai/rooms/:roomId/queue-summary` and `GET /api/ai/jobs/:jobId` for asynchronous background AI summarization.
  - `server/routes/meetingFeatureRoutes.js`: Dispatches background email reminder tasks for invitees upon meeting scheduling.
  - `Dockerfile`: Production multi-stage Docker build with client asset compilation, unprivileged `node` user execution, and automated health checks against `/api/health`.
  - `.dockerignore`: Exclusion rules preventing secrets, node_modules, and test files from entering container builds.
  - `docker-compose.yml`: Multi-service orchestration connecting `app`, `mongo:7.0`, and `redis:7-alpine` with healthcheck dependencies.
  - `.github/workflows/ci.yml`: GitHub Actions automated CI workflow running linting (`npm run lint`), syntax and build checks (`npm run check`), and integration tests (`npm test`) on push and pull requests to `main` and `backend-improve`.
  - `test/phase3ObservabilityAndQueue.test.js`: Integration tests validating correlation IDs, health endpoint, queue enqueue/execution with in-memory fallback, and Sentry graceful degradation.
- **Changed**:
  - Updated `server/server.js` with structured logging, Sentry exception capture, and graceful queue shutdown.
  - Updated `package.json` with pinned Phase 3 dependencies (`pino`, `pino-http`, `@sentry/node`, `@sentry/react`, `bullmq`) and updated `check:server` script.
  - Updated `.env.example` with Phase 3 configuration options.
  - Updated `docs/DECISIONS.md` with architectural records for observability, queues, and containerization.

### UI/UX: Dark Mode Toggle & Comprehensive Adaptive Styling

- **Added**:
  - `src/context/ThemeContext.jsx`: Zero-localStorage React context providing theme state and switching via `sessionStorage` (`syncmeet_theme`) and system preference (`prefers-color-scheme`), safely conforming to zero-localStorage policy.
  - `src/components/common/ThemeToggle.jsx`: Polished accessible toggle component offering header pill, circular icon, and settings menu switch variants with smooth icon transitions and keyboard navigation.
  - `tailwind.config.js`: Configured `darkMode: 'class'`.
- **Changed**:
  - `src/index.css`: Added adaptive theme transitions, dark color scheme, and dark-adapted glassmorphic scrollbars.
  - `src/App.jsx`: Wrapped application in `<ThemeProvider>`.
  - Comprehensive dark mode adaptation across all components preserving default light mode aesthetics:
    - `src/components/lobby/DeviceSetup.jsx`: Welcome card, mode toggles, name & room code inputs, action buttons, device settings, feature cards, recent meetings list, and footer.
    - `src/components/lobby/WaitingRoomScreen.jsx`: Full adaptive layout, header toggle, glass card, pulse indicators, and return buttons.
    - `src/components/lobby/PermissionModal.jsx`: Adaptive permission instructions, dialog surfaces, and action button.
    - `src/components/lobby/ScheduleMeetingModal.jsx`: Modal backdrop, dialog surface, form inputs, agenda item fields, and upcoming scheduled meetings list.
    - `src/components/meeting/HeaderBar.jsx`: Integrated dark mode toggle pill in the meeting header with adaptive badge styles.
    - `src/components/meeting/MeetingRoom.jsx`: Video-first stage background, left navigation, participant sidebar panel, tools card, and mobile navigation bar.
    - `src/components/meeting/VideoTile.jsx`: Tile container, borders, participant avatar fallbacks, and action tool buttons.
    - `src/components/meeting/ControlDock.jsx`: Leave meeting confirmation dialog, action button pills, and backdrop.
    - `src/components/meeting/BreakoutRoomsPanel.jsx`: Small groups cards, duration/room count selectors, status badges, and action buttons.
    - `src/components/meeting/HostControlsModal.jsx`: Mute all, lock room, and end meeting confirmation banner.
    - `src/components/meeting/HostAdmitBanner.jsx`: Floating knocking admission requests banner with admit/deny action buttons.
    - `src/components/meeting/WhiteboardPanel.jsx`: Whiteboard canvas header, toolbar buttons, color picker swatch, and canvas stage.
    - `src/components/sidebar/SidebarContainer.jsx`: Navigation tabs, header container, and scroll areas.
    - `src/components/sidebar/AINotesPanel.jsx`: Action bar, empty state, summary cards, action items with priority badges, and export buttons.
    - `src/components/sidebar/LiveTranscript.jsx`: Live speech banners, message bubbles, and manual entry forms.
    - `src/components/sidebar/RoomChat.jsx`: Chat message bubbles, sender labels, quick emoji bar, and text inputs.
    - `src/components/sidebar/AIAssistantChat.jsx`: AI message cards, user bubbles, thinking animation state, quick prompt suggestions, and input form.
    - `src/components/sidebar/AgendaPanel.jsx`: Agenda items list, status checkboxes, delete actions, and new item creation form.
    - `src/components/sidebar/MeetingPollsPanel.jsx`: Live voting bars, poll creation forms, question upvote cards, and answer inputs.
    - `src/components/history/MeetingHistoryModal.jsx`: Search inputs, meeting archives list, meeting detail view, tabs, and export actions.
    - `src/components/auth/LoginPage.jsx`: Top-right toggle, authentication card, inputs, mode tabs, and guest join button.
    - `src/components/auth/UserMenu.jsx`: Integrated dark mode toggle switch into the profile dropdown.
    - `src/components/auth/UserProfileModal.jsx`: Light/dark adaptive modal surface, profile inputs, avatar color theme pickers, and save buttons.
