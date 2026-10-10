# Bug Log

Record only reproduced defects. Unverified risks remain in the checklist until demonstrated.

| Bug ID | Checklist ID | Severity | Reproduction | Expected | Actual | Root cause | Files | Fix | Regression evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-001 | AI-005 / SEC-002 | Medium | Before fix, POST a valid transcript to `/api/ai/summarize` without a room ticket; existing test showed the request reached the mocked Gemini provider. | Only a participant/host with a matching room ticket can invoke provider-backed AI for that room; cross-room tickets fail. | Previously public summarize/ask routes could relay anonymous requests to the configured Gemini provider and consume quota. | AI routes lacked room ID scope and `requireRoomAccess`; client helpers submitted no room ID. | `server/routes/aiRoutes.js`, `src/services/apiService.js`, `src/services/geminiService.js`, `src/components/sidebar/AIAssistantChat.jsx`, `src/components/sidebar/SidebarContainer.jsx`, `src/App.jsx`, `test/meetingFeatures.test.js` | Added `/rooms/:roomId/summarize` and `/rooms/:roomId/ask` guarded by `requireRoomAccess`; passed the scoped room ID and stored ticket from both frontend flows. | Focused integration test passes: anonymous and cross-room summary receive 401 without provider use; anonymous ask receives 401; valid participant ticket works for summary and ask; validation and malformed provider failure remain intact. | FIXED |
| BUG-002 | UI-002 / ROOM-005 | Medium | With a room locked, open its link in a page with a cached participant room ticket and select Enter. | A participant must see the waiting lobby and request host admission. | Before fix, the client skipped the join endpoint when any cached room ticket existed, opened the meeting UI, and then received 403s for locked-room feature requests. | `handleJoinRoom` trusted a cached non-host ticket and never refreshed server-derived `requiresAdmission`. | `src/App.jsx` | Revalidate cached non-host access through `joinMeetingRoom` so the current server admission state is applied before entering the meeting. | Browser re-test displayed “Asking to be let in…”; host saw the knock, Admit joined the guest, and Deny returned the guest to the lobby. | FIXED |
| BUG-003 | UI-004 / ROOM-005 | Medium | Lock a room, reload the host page, then open Host Controls. | The host sees the authoritative current room-lock state after reconnecting. | Before fix, the browser showed “Meeting is open” while a fresh guest was routed to admission. | Lock state defaulted to false and the server did not send current lock state on socket join; join was also emitted before App event subscriptions were registered. | `src/App.jsx`, `server/socket/socketHandler.js`, `test/meetingFeatures.test.js` | Register App listeners before joining; emit current lock state to the joining socket after successful room membership. | Integration test asserts a host joining a locked room receives `{ isLocked: true }`; browser host controls now display “Meeting is locked” after guest refresh; full suite/build pass. | FIXED |

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

## BUG-019 - Dark-mode choice was limited to a tab and flashed dark on startup
- **Reproduction/evidence:** Clicked the login-page theme button and guest account-menu switch. The UI toggle did switch `data-theme`, body colors, and both controls; however, the implementation stored the preference only in `sessionStorage`, and `index.html` hard-coded the document as dark before React mounted.
- **Root cause:** A tab-scoped preference and static dark initial markup did not preserve a deliberate choice across browser sessions or align first paint with the selected/system theme.
- **Fix:** Persist explicit choices in `localStorage` (migrating a valid existing session preference), initialize the document theme synchronously before paint using the saved preference or system setting, and remove the hard-coded dark root/body colors. Added cross-tab storage synchronization and system-preference updates when no saved choice exists.
- **Regression evidence:** Clicked dark and light modes in the browser; confirmed root class, `data-theme`, computed body background and local preference; reloaded in each mode and confirmed the selected theme remained. Guest-menu switch and header switch stayed synchronized. `npm run check` passed.
- **Status:** FIXED; browser click/reload verified.

## BUG-020 - React meeting-effect cleanup treated reruns as permanent leave
- **Reproduction/evidence:** A guest already admitted to a locked room refreshed/re-entered through session restoration. Before the lifecycle fix, a meeting effect rerun could emit `leave-room`, deleting the participant membership required for locked-room rejoin.
- **Root cause:** `leaveRoom()` was called by a React effect cleanup that also runs when effect dependencies change, not only when a user intentionally leaves the meeting.
- **Fix:** Effect cleanup now only removes event listeners. Explicit meeting completion performs the permanent room leave. The socket join guard also retains its joined-socket identity when room, token, participant, and parent-room identity are unchanged.
- **Regression evidence:** Static regression asserts cleanup does not call `leaveRoom()` while explicit finish does. Browser verification on 2026-10-09: with the room locked, a previously admitted guest refreshed and returned with both participants present; both video elements were 640×480 with live audio/video tracks. Confirmed “Yes, Leave” returned the guest to setup; reusing the same room while locked produced a host knock, host denial returned the guest to setup, and the old ticket’s room-state request returned 403. `npm test` passed 36/36 and `npm run check` passed.
- **Verification limit:** The exact sequence was verified against the local app/API, not as a separate Atlas persistence assertion. TURN/cross-network behavior is not covered.
- **Status:** FIXED; browser lifecycle verified.

## BUG-021 - Expected schedule metadata miss logged as an API warning on room-code join
- **Reproduction/evidence:** Entering an unscheduled room code triggers an optional schedule metadata lookup. The endpoint correctly returned 404 “Scheduled meeting not found”, but `ApiService.request` logged it as a warning before the lobby continued with the actual room join.
- **Root cause:** The shared request logger treated this optional metadata lookup’s expected 404 like an operational API failure.
- **Fix:** Preserve the 404 rejection and response semantics, but allow `getScheduledMeeting` to suppress only the API-service warning for HTTP 404. Other status and network errors continue to log; the room join remains authoritative.
- **Regression evidence:** Browser test with route interception returned the expected schedule 404 and an unknown-room join 404. No schedule API warning was logged; the join failure remained visible in the lobby. `npm run check` and full suite 38/38 pass.
- **Verification limit:** The API process was unavailable during this follow-up, so this specific UI test used intercepted responses; no live route status was re-queried.
- **Status:** FIXED IN SOURCE; live API recheck pending.

## BUG-022 - Temporary disconnect was reported as connected in persisted room state
- **Reproduction/evidence:** In a disposable Mongo-backed room, a socket disconnect correctly left one participant row and cleared its socket ID, but the row had no `isDisconnected` property. `GET /api/rooms/:roomId/state` consequently reported `isDisconnected: false`. The same omission was reproduced in the in-memory disconnect path.
- **Root cause:** `persistParticipantState` omitted the supplied disconnect flag, the Room participant schema did not declare it, and the state response treated a missing flag as connected.
- **Fix:** Persist `isDisconnected` in both store paths, declare it in the participant schema, and infer disconnect from a missing socket ID when reading legacy participant rows.
- **Regression evidence:** The rejoin test now checks disconnected state in the room store and state API, then verifies the flag clears after rejoin. A disposable real-Mongo harness verified active join, disconnect, room-state response, rejoin without duplication, and explicit leave cleanup. `npm test` passed 39/39 and `npm run check` passed.
- **Status:** FIXED; memory and disposable Mongo paths verified.

## BUG-023 - Concurrent Mongo poll votes failed with document version conflicts
- **Reproduction/evidence:** A disposable Mongo room received 24 simultaneous distinct poll votes; only 3 returned 200, while 21 returned 500 with Mongoose `VersionError` from concurrent document saves.
- **Root cause:** Poll voting loaded a Mongoose document, mutated its options in memory, and called `save()`. Concurrent requests raced on the same document version. Question upvotes used the same read-modify-save pattern and were vulnerable to lost updates.
- **Fix:** Apply Mongo aggregation-pipeline updates atomically for poll voting and question upvote toggling. Poll votes condition on the poll remaining open, remove the voter's old choice(s), and add the voter to selected options. Question upvotes atomically toggle the participant ID.
- **Regression evidence:** Against a disposable Mongo room, 24/24 simultaneous distinct poll votes and 24/24 simultaneous distinct question upvotes returned 200 and persisted exactly once; two concurrent toggles by the same participant did not create duplicate upvotes. `npm test` passed 39/39 and `npm run check` passed.
- **Cleanup:** Removed only the generated room, poll and question. No existing meeting data was queried or altered.
- **Status:** FIXED; disposable Mongo concurrency verified.

## BUG-024 - Unverified GitHub/Microsoft profiles created sessions in development
- **Reproduction/evidence:** With `NODE_ENV=development`, `POST /api/auth/github` accepted a caller-supplied email/name/provider ID and returned HTTP 200 with a session. The routes skipped their production-only rejection and passed unverified request fields to account/session creation.
- **Root cause:** GitHub and Microsoft callback routes were demo implementations that treated client-provided profile fields as verified identity outside production.
- **Fix:** Replace both handlers with explicit HTTP 501 responses until real provider-side OAuth flows exist; keep OTP's separate development behavior unchanged.
- **Regression evidence:** The auth lifecycle test sets development mode and asserts both endpoints return 501, `success: false`, and no cookie. Targeted test passed; full suite passed 40/40.
- **Status:** FIXED; not-yet-implemented providers fail closed in every environment.

## BUG-025 - Closed Google OAuth popup left sign-in loading until timeout
- **Reproduction/evidence:** The callback page closes itself after posting a result, but the parent flow only had a three-minute timeout and did not observe popup closure. If the response could not be delivered, the login UI remained in its connecting state while the closed popup could not make further progress. A browser test now exercises the closed-without-response path.
- **Root cause:** No popup-closure observation or prompt error path existed in `signInWithGoogle`.
- **Fix:** Poll popup closure with a 1.5-second grace period; if no callback arrives, reject with a clear user-facing error and clean up listeners, timers and channel.
- **Regression evidence:** Chromium E2E test passed: a popup that closes without a response produces the visible error and re-enables the Google button. `npm test` passed 40/40 and `npm run check` passed.
- **Verification limit:** A successful live Google account/provider callback was not run; local callback URL and frontend-origin values were checked without exposing secrets.
- **Status:** FIXED; popup-close failure path browser-verified, external Google flow still unverified.

## BUG-026 - Concurrent breakout creation could persist multiple active sessions
- **Reproduction/evidence:** Before the fix, 12 simultaneous create requests against one disposable Mongo room produced six HTTP 201 responses and six 409 responses, leaving six active breakout documents.
- **Root cause:** The Mongo route used a check-then-insert sequence (`findOne` followed by `create`) without a database uniqueness constraint, so concurrent requests could all pass the check.
- **Fix:** Add a partial unique index on `{ roomId, status }` for active records, ensure that index at Mongo startup, and map duplicate-key insert races to the existing HTTP 409 conflict response. If legacy duplicate active rows prevent index creation, Mongo startup disconnects and fails readiness rather than proceeding without the invariant.
- **Regression evidence:** `test/breakoutConcurrency.test.js` now asserts 12 simultaneous requests yield one 201 and eleven 409 responses with exactly one active row. A second disposable-Mongo test seeds two duplicate active rows, verifies startup returns false/disconnected, and confirms both rows remain unchanged. Full suite passed 44/44; `npm run check` passed; targeted ESLint passed.
- **Data safety:** Tests used fresh `mongodb-memory-server` instances and did not query or modify Atlas/shared meeting data.
- **Status:** FIXED; disposable Mongo concurrency and startup-failure paths verified.
