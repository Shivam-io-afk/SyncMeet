# CHANGELOG — SyncMeet AI

Historical changelog entries describe development work and are not evidence of production readiness or a deployed integration. See the production limitations in the root README for current status.

## [Unreleased] — Frontend reliability and product-claim cleanup
### Changed
- Added Google OAuth authorization-code sign-in with server-side code exchange, verified Google profile lookup, CSRF state validation, and a same-origin popup response. Live sign-in still depends on matching Google Cloud Console callback configuration.
- Removed unused legacy authentication/database dialogs and their local-storage service, which stored account passwords in browser storage.
- Removed the seeded meeting chat message and simulated meeting participants; the room now reflects connected peers.
- Corrected the live-caption control tooltip to clarify that hiding captions does not stop transcription.
- Screen-share video is included in the outgoing WebRTC media stream.
- Finalized local speech-recognition segments are saved to local meeting history and broadcast to participants in the room.
- Updated the README and project memory to document the current prototype's production limitations.

## [2.4.0] - 2026-10-09 — Full Backend Verification, Profile Persistence & Chat History Buffer
### Added
- Implemented authenticated `PUT /api/auth/profile` in `server/routes/authRoutes.js` and added `title` and `avatarColor` to the MongoDB `User` model.
- Extended `server/middleware/authMiddleware.js` (`protect` and `optionalProtect`) to query, select, and populate `title` and `avatarColor` on `req.user`.
- Added `apiService.updateProfile` in `src/services/apiService.js` and updated `cryptoAuthService.updateProfile` to sync profile mutations with the backend database.
- Upgraded `src/components/auth/UserProfileModal.jsx` to await async backend persistence and show responsive saved feedback.
- Implemented in-room chat history buffering in `server/socket/socketHandler.js` (bounded up to 100 messages per room) with `room-chat-history` event replay on join, ensuring participants who refresh or join mid-call retain conversation history.
- Added automated integration tests for profile persistence and in-room chat history buffering in `test/storageAndDbBridge.test.js`.
- Configured `--test-concurrency=1` in `package.json` to ensure deterministic execution of all 18 test suites across platforms.

## [2.3.0] - 2026-10-09 — Zero LocalStorage and Backend Database Bridge
### Added
- Automated static code audit test in [`test/storageAndDbBridge.test.js`](file:///c:/WEB/React/Reat2.0/test/storageAndDbBridge.test.js) asserting zero `localStorage` calls across all frontend source files.
- Integration tests in [`test/storageAndDbBridge.test.js`](file:///c:/WEB/React/Reat2.0/test/storageAndDbBridge.test.js) verifying meeting archive persistence with room tickets and retrieval via `/api/history/:roomId`.
- Added user profile auto-hydration on App initialization via `/api/auth/me` to synchronize active accounts directly from MongoDB.
- Connected [`src/services/dbService.js`](file:///c:/WEB/React/Reat2.0/src/services/dbService.js) to the backend Express API (`/api/history`, `/api/features`, `/api/auth`) so that meeting history, AI notes, and archives persist directly to MongoDB while retaining IndexedDB as a resilient offline cache.

### Changed
- Eradicated all `localStorage` usage across [`src/services/apiService.js`](file:///c:/WEB/React/Reat2.0/src/services/apiService.js), [`src/services/cryptoAuthService.js`](file:///c:/WEB/React/Reat2.0/src/services/cryptoAuthService.js), [`src/components/lobby/DeviceSetup.jsx`](file:///c:/WEB/React/Reat2.0/src/components/lobby/DeviceSetup.jsx), and [`src/components/lobby/ScheduleMeetingModal.jsx`](file:///c:/WEB/React/Reat2.0/src/components/lobby/ScheduleMeetingModal.jsx), replacing with tab-scoped `sessionStorage`.
- Fixed room access token inclusion in [`src/services/apiService.js`](file:///c:/WEB/React/Reat2.0/src/services/apiService.js) `saveMeeting` and `getHistory` methods.
- Reordered `finishMeeting` in [`src/App.jsx`](file:///c:/WEB/React/Reat2.0/src/App.jsx) to ensure meeting history is successfully archived before session keys are purged.

## [2.2.0] - 2026-10-08 — Simplified Sign-In and Registration
### Added
- A dedicated sign-in/register page with an explicit guest option.
- Social provider and email OTP flows are not implemented; production routes return an unavailable response.

## [2.1.0] - 2026-10-08 — Authentication Scaffold & Waiting Room Signaling
### Added
- Google OAuth authorization-code flow with server-side code exchange and verified profile lookup; deployment still requires the matching Google Cloud Console configuration.
- **Meeting Waiting Room & "Knock to Join" Host Approval**:
  - Engineered [`src/components/lobby/WaitingRoomScreen.jsx`](file:///c:/WEB/React/Reat2.0/src/components/lobby/WaitingRoomScreen.jsx) with radar animation and cancellation controls.
  - Engineered [`src/components/meeting/HostAdmitBanner.jsx`](file:///c:/WEB/React/Reat2.0/src/components/meeting/HostAdmitBanner.jsx) with real-time Admit & Deny actions for the host.
  - Added Socket.io waiting-room signaling. The server does not enforce the gate before room joins.

## [2.0.0] - 2026-10-08 — Backend & Collaboration Prototype
### Added
- **Backend Node.js & Express 5 Server**: Built [`server/server.js`](file:///c:/WEB/React/Reat2.0/server/server.js) with static SPA asset serving and RESTful API routes.
- **Socket.io Real-Time & WebRTC Mesh Signaling**: Engineered [`server/socket/socketHandler.js`](file:///c:/WEB/React/Reat2.0/server/socket/socketHandler.js) and [`src/hooks/useWebRTC.js`](file:///c:/WEB/React/Reat2.0/src/hooks/useWebRTC.js) for peer connection management (SDP offer/answer and ICE candidate exchange).
- **JWT Authentication & Bcrypt Password Hashing**: Implemented [`server/routes/authRoutes.js`](file:///c:/WEB/React/Reat2.0/server/routes/authRoutes.js) and [`server/middleware/authMiddleware.js`](file:///c:/WEB/React/Reat2.0/server/middleware/authMiddleware.js) with 30-day token expiration and resilient in-memory sandbox fallbacks.
- **MongoDB Atlas Mongoose Models**: Built database schemas for [`User.js`](file:///c:/WEB/React/Reat2.0/server/models/User.js), [`Room.js`](file:///c:/WEB/React/Reat2.0/server/models/Room.js), [`Transcript.js`](file:///c:/WEB/React/Reat2.0/server/models/Transcript.js), and [`AINote.js`](file:///c:/WEB/React/Reat2.0/server/models/AINote.js).
- **Real-Time In-Meeting Broadcasts**: Wired Socket.io streams for in-room chat, floating emoji reactions, live whiteboard drawing strokes, closed captions, hand-raising, and host moderation (mute all, room locking, end meeting).
- **Client HTTP API Integration**: Engineered [`src/services/apiService.js`](file:///c:/WEB/React/Reat2.0/src/services/apiService.js) for REST requests with Bearer JWT token header injection.
- **Production Scripts & Proxy**: Added `"server"`, `"dev:all"`, and `"start"` scripts to `package.json`, and configured Vite API proxy to backend on port 5000.
