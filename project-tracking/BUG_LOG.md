# Bug Log

Record only reproduced defects. Unverified risks remain in the checklist until demonstrated.

| Bug ID | Checklist ID | Severity | Reproduction | Expected | Actual | Root cause | Files | Fix | Regression evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-001 | AI-005 / SEC-002 | Medium | Before fix, POST a valid transcript to `/api/ai/summarize` without a room ticket; existing test showed the request reached the mocked Gemini provider. | Only a participant/host with a matching room ticket can invoke provider-backed AI for that room; cross-room tickets fail. | Previously public summarize/ask routes could relay anonymous requests to the configured Gemini provider and consume quota. | AI routes lacked room ID scope and `requireRoomAccess`; client helpers submitted no room ID. | `server/routes/aiRoutes.js`, `src/services/apiService.js`, `src/services/geminiService.js`, `src/components/sidebar/AIAssistantChat.jsx`, `src/components/sidebar/SidebarContainer.jsx`, `src/App.jsx`, `test/meetingFeatures.test.js` | Added `/rooms/:roomId/summarize` and `/rooms/:roomId/ask` guarded by `requireRoomAccess`; passed the scoped room ID and stored ticket from both frontend flows. | Focused integration test passes: anonymous and cross-room summary receive 401 without provider use; anonymous ask receives 401; valid participant ticket works for summary and ask; validation and malformed provider failure remain intact. | FIXED |
| BUG-002 | UI-002 / ROOM-005 | Medium | With a room locked, open its link in a page with a cached participant room ticket and select Enter. | A participant must see the waiting lobby and request host admission. | Before fix, the client skipped the join endpoint when any cached room ticket existed, opened the meeting UI, and then received 403s for locked-room feature requests. | `handleJoinRoom` trusted a cached non-host ticket and never refreshed server-derived `requiresAdmission`. | `src/App.jsx` | Revalidate cached non-host access through `joinMeetingRoom` so the current server admission state is applied before entering the meeting. | Browser re-test displayed “Asking to be let in…”; host saw the knock, Admit joined the guest, and Deny returned the guest to the lobby. | FIXED |
| BUG-003 | UI-004 / ROOM-005 | Medium | Lock a room, reload the host page, then open Host Controls. | The host sees the authoritative current room-lock state after reconnecting. | The existing browser page showed “Meeting is open” while a fresh guest was routed to admission. | Lock state defaulted to false and the server did not send current lock state on socket join; join was also emitted before App event subscriptions were registered. | `src/App.jsx`, `server/socket/socketHandler.js`, `test/meetingFeatures.test.js` | Register App listeners before joining; emit current lock state to the joining socket after successful room membership. | Integration test asserts a host joining a locked room receives `{ isLocked: true }`; full suite/build pass. Browser recheck against a restarted backend is still needed because the QA backend process predated this server-side change. | FIXED (automated; live backend recheck pending) |

## Not bugs by themselves

- The baseline Gemini test deliberately supplies invalid provider-shaped output. The backend logs an expected validation error, returns a failure response and passes the negative-path test.
- Missing live infrastructure (MongoDB, provider credentials, TURN/deployment stack) is a blocker/risk, not a confirmed defect.

## BUG-004 - Fake dev login on rejected credentials (fixed)
In dev mode any backend rejection (401/429) fell back to a local demo user, showing 'Welcome, <name>' with no token (history failed with 'no token'). Fix: local fallback now only when the server is unreachable (cryptoAuthService.signIn).


## BUG-007 - Reload/rejoin drops participants ('Could not save your meeting history')
- Root cause: legacy unique index roomId_1_userId_1 on Atlas meetingattendances; rejoin with new socket id hit E11000, join-room errored, App wiped session.
- Fix: server/config/db.js drops legacy index on connect; attendance upsert retry in socketHandler.js; peer dedupe in useWebRTC.js.
- Verification: files/rejoin.mjs socket repro - A2 rejoin returned peers, no error (before: error). npm test run after fix.


## BUG-005 - Stale Recent panel after archive delete
Fixed via syncmeet:history-changed event (Recent + Archives).

## BUG-006 - Auth limiter counted successful logins
Fixed: skipSuccessfulRequests true, default limit 20. Verified in code only.

## BUG-007 addendum
Attendance persistence failures are now non-fatal. Regression test 'a reloaded participant rejoins with a new socket and still sees existing peers' passes (npm test 13/13).

## BUG-008 - Participant and media state was not persisted in room documents
- **Reproduction/evidence:** The provided Atlas screenshot showed an active room with empty `participants` and `attendeeIds` arrays. The socket join handler wrote account attendance separately but never updated `Room.participants`; live media state existed only in the process-local socket map. A reconnect therefore defaulted to unmuted.
- **Root cause:** The room's existing participant subdocument model was unused by socket join, media update, host mute-all, and disconnect paths.
- **Fix:** Atomically replace the room subdocument for the stable ticket participant ID on join/media change, restore saved mute/video values on rejoin, clear only the transient socket ID on disconnect, and persist host mute-all before notifying clients. Applied the same stable-ID replacement behavior in the in-memory store. The client applies restored media flags to both React state and actual MediaStream tracks.
- **Regression evidence:** The integration test covers host mute-all, disconnect, rejoin with an unmuted client payload, restored muted state, stale socket cleanup, peer restoration, and no duplicate participant row. Full suite: 13/13; build/check passes. Atlas read-only verification on the shared test room found 2 participant rows with boolean media state and live socket IDs. The initial live attempt exposed Mongoose's required `updatePipeline` option; fixed and retested against Atlas.
- **Limit:** No browser-driven refresh after host mute was performed because the open browser pages were not shared. Atlas persistence was verified for connected participants; a live host mute/refresh sequence remains unverified.
- **Status:** FIXED; UI workflow pending.

## BUG-009 - Room read endpoint returned internal participant/admission identifiers
- **Reproduction/evidence:** `GET /api/rooms/:roomId` returned the complete Mongoose room document to any valid room-ticket holder, including `hostId`, `attendeeIds`, `admittedParticipantIds`, participant IDs, and socket IDs.
- **Root cause:** The route serialized the full document rather than an explicit public room view.
- **Fix:** Project only room metadata, settings, agenda, lock/active status, and creation time in both database and in-memory paths.
- **Regression evidence:** Room ticket integration test seeds private IDs, reads the room with a valid ticket, and asserts only the approved response fields are present. Full suite: 13/13.
- **Status:** FIXED.

## BUG-010 - Authenticated room creation could reactivate ended rooms
- **Reproduction/evidence:** A host could POST `/api/rooms/create` with the ID of an ended room they owned. The database path set `isActive = true` and updated the title without revoking old room tickets or clearing persisted participants; the memory path replaced the stored object, producing different behavior.
- **Root cause:** Room creation treated same-owner room-ID reuse as an idempotent create instead of creating a new meeting instance.
- **Fix:** Make room creation create-only in both persistence paths. Validate a supplied ID, use UUIDs for generated IDs, and return 409 for existing IDs; map Mongo duplicate-key races to the same conflict response.
- **Regression evidence:** Test verifies same-owner and cross-owner reuse return 409 without mutating the ended room, malformed IDs return 400, and new room creation returns a host ticket. Full suite: 14/14.
- **Verification limit:** In-memory flow and duplicate-key response logic are covered/source-checked; concurrent duplicate creation was not run against Atlas.
- **Status:** FIXED.

## BUG-011 - Private scheduled meeting details could bypass admission on the database path
- **Reproduction/evidence:** `GET /api/features/schedules/:roomId` used a database projection excluding `invitees`, then relied on `meeting.invitees?.length` to decide whether to invoke room-ticket/admission checks. A private schedule therefore appeared public on the Mongo path; the in-memory path retained `invitees` and correctly enforced admission.
- **Root cause:** The query projection removed the field required for the authorization decision before the decision was made.
- **Fix:** Load the schedule with its access-control fields intact; the response serializer continues to omit `invitees` and `createdBy`.
- **Regression evidence:** Focused REST security test passes and asserts anonymous access is denied, an unadmitted ticket receives 403, and authorized output omits private invitee/creator fields. Build/check passes.
- **Verification limit:** The route's Mongo query branch was not exercised against Atlas because the shared database must not be used for destructive or synthetic security testing.
- **Status:** FIXED IN SOURCE; Mongo-path runtime verification pending.

## BUG-012 - Expired breakout sessions could block new sessions after restart
- **Reproduction/evidence:** The feature API considered every `status: 'active'` record active, even if its `endsAt` was in the past. After restart, a host could receive 409 when creating a new breakout until a socket rejoin restored the prior session and expired it.
- **Root cause:** Time-based cleanup ran from socket restoration/timers but not from the feature API's list/create paths.
- **Fix:** Expire overdue active breakout records before listing or checking for an existing active session, in both Mongo and in-memory storage.
- **Regression evidence:** The in-memory HTTP test seeds an expired active session, verifies a new breakout can be created, and verifies list results exclude/mark expired sessions ended. Full suite 14/14; `npm run check` passes.
- **Verification limit:** The Mongo expiration update branch was not exercised against Atlas.
- **Status:** FIXED IN SOURCE; Mongo-path runtime verification pending.

## BUG-013 - Ended-room access check was bypassed by the Mongo projection
- **Reproduction/evidence:** `requireRoomAccess` checked `room.isActive === false`, but the Mongo query selected only `isLocked admittedParticipantIds`. The selected database object therefore never contained `isActive`, allowing old room tickets to continue using feature APIs after a meeting ended. The memory path already denied the same request.
- **Root cause:** The authorization query omitted the state field that its subsequent denial check depended on.
- **Fix:** Include `isActive` in the Mongo projection. Archive operations now use narrowly scoped access middleware: ticket holders can read their ended room archive and only the host can save/replace it; other active-room feature routes still reject ended rooms.
- **Regression evidence:** Integration verifies ended rooms reject normal feature API access, host can save after the room ends, participant cannot overwrite the archive, host/participant tickets can read the archive, malformed archives are rejected, and cross-room tickets cannot read it. Full suite: 14/14.
- **Verification limit:** These route tests use the in-memory path; the Mongo `isActive` projection and archive access path have not been exercised against Atlas.
- **Status:** FIXED IN SOURCE; Mongo-path runtime verification pending.

## BUG-014 - Account archive details were never loaded from the server
- **Reproduction/evidence:** The account history modal fetched `/api/history/recent` for the list and merged only IndexedDB data. It never requested a meeting's persisted `/api/history/:roomId` archive, so account archives could show metadata but omit server-stored transcripts and AI notes, especially on another device.
- **Root cause:** The UI treated recent-meeting metadata/local browser records as the complete account archive; the existing full archive endpoint required a room access ticket and was not wired to account history.
- **Fix:** Added an authenticated account archive read that requires completed meeting membership (host ID, attendee ID, or attendance record), returns only safe archive fields, and denies anonymous/unrelated users. The modal now fetches server archive details on selection and keeps the user's current selection in sync with refreshed account history.
- **Regression evidence:** Meeting route test verifies host and recorded participant can read, anonymous access receives 401, unrelated account receives 404, and internal host ID is not returned. Full suite 14/14; targeted meeting feature file 7/7; `npm run check` passes.
- **Verification limit:** API regression exercises the memory store. The Mongo authorization query and authenticated browser interaction were not live-tested.
- **Status:** FIXED IN SOURCE; Mongo/browser verification pending.

## BUG-015 - Frontend relied on localStorage for JWT token, room tickets, and user state
- **Reproduction/evidence:** Audit found `localStorage` in `apiService.js`, `cryptoAuthService.js`, `DeviceSetup.jsx`, and `ScheduleMeetingModal.jsx`. This caused persistent tokens to leak across browser sessions without explicit server invalidation, conflicting with the session storage & database source-of-truth requirement.
- **Root cause:** Token, room ticket, and username caching were written directly to `localStorage`.
- **Fix:** Migrated all client token, ticket, and session caching to `sessionStorage` with safe try/catch wrapping. Hooked `App.jsx` to authenticate with `/api/auth/me` on startup to rehydrate user profiles directly from the backend database. Added integration test `test/storageAndDbBridge.test.js` to assert zero `localStorage` references across all files in `src/`.
- **Regression evidence:** `test/storageAndDbBridge.test.js` passes (asserting 0 occurrences of `localStorage` in `src/`). Full suite 16/16 passes. `npm run check` passes with 0 errors.
- **Status:** FIXED.

## BUG-016 - History archive saving on meeting exit dropped room access token
- **Reproduction/evidence:** When a host ended or left a meeting, `finishMeeting` removed the session key before calling `saveMeetingHistory()`, and `apiService.saveMeeting` depended on the active room key in storage rather than explicitly supplying the room access token for that room ID, triggering 401 on `/api/history/:roomId/save`.
- **Root cause:** Race condition in `finishMeeting` order of operations combined with missing room access token header parameter in `apiService.saveMeeting`.
- **Fix:** Explicitly pass `X-Room-Access-Token` in `apiService.saveMeeting` and `getHistory`, and reordered `finishMeeting` in `App.jsx` to await `saveMeetingHistory` before removing session keys.
- **Regression evidence:** Integration test `meeting archives save with host room token and are retrievable by room token` passes with status 201 and 200. Full test suite 16/16 passes.
- **Status:** FIXED.

## BUG-017 - Missing backend profile update endpoint and persistence
- **Reproduction/evidence:** `UserProfileModal.jsx` allows authenticated users to customize display name, title/role, and avatar color gradient, but `authRoutes.js` had no `PUT /profile` endpoint. Updates were only stored in browser session memory and lost across re-logins or server sessions.
- **Root cause:** The backend lacked a profile mutation route, and the `User` mongoose schema did not define `title` and `avatarColor` fields.
- **Fix:**
  1. Added `title` and `avatarColor` to `server/models/User.js`.
  2. Implemented authenticated `PUT /api/auth/profile` in `server/routes/authRoutes.js` with validation (1-80 chars for name, 100 for title and avatarColor) and atomic database update (`User.findByIdAndUpdate`).
  3. Updated `authMiddleware.js` to select and populate `title` and `avatarColor` on `req.user`.
  4. Added `apiService.updateProfile` and connected `cryptoAuthService.updateProfile` to sync with backend when authenticated.
- **Regression evidence:** Added test `PUT /api/auth/profile updates authenticated user profile and reflects in GET /api/auth/me` in `test/storageAndDbBridge.test.js`. Rejects unauthenticated (401), rejects invalid (400), updates valid fields (200), and reflects in `GET /api/auth/me`. 18/18 tests passing.
- **Status:** FIXED.

## BUG-018 - In-room chat messages lost when participant rejoins or refreshes
- **Reproduction/evidence:** Chat messages broadcast via `send-chat-message` were strictly ephemeral in `socketHandler.js`. When an active meeting participant refreshed their browser or joined mid-meeting, they were presented with an empty chat panel.
- **Root cause:** No bounded in-memory buffer existed for in-flight meeting chat messages on the backend.
- **Fix:**
  1. Added `roomChatHistory` bounded buffer (up to 100 messages per room) in `server/socket/socketHandler.js`.
  2. Emitted `room-chat-history` to joining sockets upon `join-room`.
  3. Cleaned up room chat history when `host-end-meeting` fires to prevent memory leaks.
  4. Wired `App.jsx` to subscribe to `room-chat-history` and populate `chatMessages` deduplicated by message ID.
- **Regression evidence:** Added automated test `in-room chat buffer stores sent messages and emits room-chat-history to newly joining participants` in `test/storageAndDbBridge.test.js`. 18/18 tests passing.
- **Status:** FIXED.


