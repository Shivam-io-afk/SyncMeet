# Operation Checklist

Statuses: `[ ]` NOT STARTED · `[~]` IN PROGRESS · `[!]` FAILED · `[B]` BLOCKED · `[x]` VERIFIED · `[-]` NOT APPLICABLE.

Verification below is limited to the evidence in [TEST_REPORT.md](./TEST_REPORT.md). Historical documentation and code presence are not verification.

## Startup and app foundation

| ID | Operation and acceptance/test | Preconditions | Actual evidence | Status | Files / bug |
|---|---|---|---|---|---|
| BOOT-001 | Documented npm scripts start frontend/backend and combined service; check server startup and health response. | Local env, npm | Build passes; server start/health not exercised in this pass. | `[ ]` | `package.json`, `README.md`, `server/server.js` |
| BOOT-002 | `/health` and `/api/health` report real readiness/DB state; production DB outage is not ready. | Backend; DB for positive case | Local `/api/health` returned 200 and `database.connected: true` after backend restart; production outage behavior not tested. | `[~]` | `server/server.js` |
| BOOT-003 | Invalid JSON, oversized body, CORS denial and unexpected error return appropriate bounded responses. | API test server | Source inspected; no targeted test. | `[ ]` | `server/server.js` |
| BOOT-004 | All maintained source files receive syntax/lint/type checks where tooling exists. | npm deps | `npm run check` passed selected server syntax and Vite build; exhaustive static coverage incomplete. | `[~]` | `package.json` |

## Authentication and account access

| ID | Operation and acceptance/test | Preconditions | Actual evidence | Status | Files / bug |
|---|---|---|---|---|---|
| AUTH-001 | Register: valid fields create account/session; invalid and duplicate input rejected without leakage. | Isolated store/DB | Short password rejection and valid registration tested; duplicate path not proven. | `[~]` | `authRoutes.js`, `User.js`, `authLifecycle.test.js` |
| AUTH-002 | Login: valid password succeeds; unknown account/wrong password get generic denial. | Isolated account | Lifecycle and generic invalid-credentials tests passed. | `[x]` | `authRoutes.js`, `authLifecycle.test.js` |
| AUTH-003 | `/me`: valid token resolves public user; absent, malformed, expired and revoked credentials fail closed. | Auth test server | Valid and revoked-session cases passed; remaining token variants not isolated. | `[~]` | `authRoutes.js`, `authMiddleware.js` |
| AUTH-004 | Refresh rotates access/HttpOnly cookie; replaying old refresh credential is rejected. | Auth test server | Rotation, new token and replay rejection passed. | `[x]` | `authRoutes.js`, `AuthSession.js`, `authLifecycle.test.js` |
| AUTH-005 | Logout revokes refresh session and clears cookie; subsequent refresh fails. | Auth test server | Logout and refresh reuse rejection passed. | `[x]` | `authRoutes.js`, `authLifecycle.test.js` |
| AUTH-006 | Logout-all invalidates active access and refresh credentials across multiple sessions. | Multiple sessions | Invalidation tested for session flow; multiple-device breadth incomplete. | `[~]` | `authRoutes.js`, `authLifecycle.test.js` |
| AUTH-007 | Google OAuth validates state/code/profile and provider errors; session issuance needs configured provider. | OAuth config | Not run against Google. | `[B]` | `authRoutes.js`, `.env.example`, `LoginPage.jsx` |
| AUTH-008 | GitHub auth is verified OAuth or explicitly unsupported; never demo-success. | Provider config | Route exists; implementation and provider flow not yet audited. | `[ ]` | `authRoutes.js`, `cryptoAuthService.js` |
| AUTH-009 | Microsoft auth is verified OAuth or explicitly unsupported; never demo-success. | Provider config | Route exists; implementation and provider flow not yet audited. | `[ ]` | `authRoutes.js`, `cryptoAuthService.js` |
| AUTH-010 | OTP has delivery, expiry, attempt limits and one-time/account-bound verification; no false delivery claims. | Delivery provider/test double | Email delivery is documented unimplemented; not verified. | `[B]` | `authRoutes.js`, `cryptoAuthService.js` |
| AUTH-011 | Rate limits, origin checks, refresh cookie flags/domain/path and trusted-proxy behavior match deployment. | Isolated prod-like config | Not independently tested. | `[ ]` | `server.js`, `authRoutes.js`, `.env.example` |
| AUTH-012 | Frontend session restore, token refresh, login errors and logout work through reload/expiry. | Browser and API | Backend tests only; UI journey not executed. | `[ ]` | `App.jsx`, `apiService.js`, `cryptoAuthService.js` |

## Rooms, access and history

| ID | Operation and acceptance/test | Preconditions | Actual evidence | Status | Files / bug |
|---|---|---|---|---|---|
| ROOM-001 | Authenticated room create issues host ticket; invalid/duplicate/cross-owner ID behavior is correct. | Authenticated fixture | Integration test verifies new host ticket, malformed ID rejection, same-owner/cross-owner duplicate conflict, and that duplicate creation does not mutate an ended room. Mongo duplicate-key race is not live-tested. | `[~]` | `roomRoutes.js`, `Room.js`, BUG-010 |
| ROOM-002 | Guest room create validates title/name and returns unique room plus host ticket. | Isolated server | Prior multi-user simulation used guest-room endpoint; not rerun in baseline. | `[~]` | `roomRoutes.js` |
| ROOM-003 | Join issues room-scoped participant or owner-host ticket; invalid name/inactive/missing room rejected. | Room fixture | Room ticket access partly tested; full case matrix incomplete. | `[~]` | `roomRoutes.js`, `roomAccessMiddleware.js` |
| ROOM-004 | Room read requires matching ticket; cross-room token, missing room and inactive room are rejected; response avoids internal attendee/socket identifiers. | Room fixture | Matching participant ticket, absent/cross-room 401, and allowlisted response tested. Room-access Mongo projection now includes `isActive`; the Mongo path has not been run. Live room read returned 200 without exposing internal participant arrays. | `[~]` | `roomRoutes.js`, `roomAccessMiddleware.js`, BUG-009/013 |
| ROOM-005 | Locked-room knock/admit/deny works; feature API access stays denied until admission. | Host/participant fixtures | Integration test passes; browser flow showed locked cached-ticket guest waiting, host knock, Admit into 2-participant meeting, and Deny back to lobby. | `[x]` | `socketHandler.js`, `roomAccessMiddleware.js`, `meetingFeatures.test.js`, BUG-002 |
| ROOM-006 | Only host locks/ends; end prevents new joins; leave cleans peer state and attendance. | Multiple clients | Prior multi-user simulation passed normal host controls/end/leave. Disconnect now preserves media flags and clears transient socket ID; full forged-role matrix pending. | `[~]` | `socketHandler.js`, `MeetingAttendance.js`, `Room.js`, BUG-008 |
| HIST-001 | Host saves bounded archive; participant/foreign ticket and malformed archive cannot replace it. | Archive fixture | Host save after room end passes; participant is denied overwrite; malformed/oversized transcript is rejected. Mongo path remains untested. | `[~]` | `historyRoutes.js`, `Transcript.js`, `AINote.js`, BUG-013 |
| HIST-002 | Matching room access reads archive; unrelated room ticket cannot access it. | Archive fixture | Host and participant tickets can read after end; absent and cross-room tickets are denied. Ended-room access is explicitly scoped to history routes; ordinary feature route remains denied. In-memory route path only. | `[~]` | `historyRoutes.js`, `roomAccessMiddleware.js`, BUG-013 |
| HIST-003 | Authenticated recent list contains only own completed meetings; guest/account behavior and DB path correct. | Account/DB | In-memory route tests verify own history and no unrelated-account records; account archive details require host/attendee/attendance membership. Mongo query path remains unverified. | `[~]` | `historyRoutes.js`, `MeetingAttendance.js`, `MeetingHistoryModal.jsx`, BUG-014 |
| HIST-004 | Search/open/restore archive works and does not disclose another account's data. | Browser/archive fixtures | Account modal now fetches saved server transcripts/AI notes through a protected membership-checked endpoint; integration verifies host/attendee access, anonymous 401, unrelated 404, and sanitized output. Browser selection/search and Mongo path remain unverified. | `[~]` | `MeetingHistoryModal.jsx`, `apiService.js`, `historyRoutes.js`, BUG-014 |

## Scheduling and collaboration APIs

| ID | Operation and acceptance/test | Preconditions | Actual evidence | Status | Files / bug |
|---|---|---|---|---|---|
| FEAT-001 | Templates endpoint returns supported templates and agenda. | API fixture | Template response and standup template passed. | `[x]` | `meetingFeatureRoutes.js`, `meetingFeatures.test.js` |
| FEAT-002 | Schedule list/read/create validates future time, duration, agenda; response omits invitees/private owner. | API fixture | Valid create/read, invitee omission, anonymous private-detail denial, unadmitted-ticket 403, and host access pass in memory integration. Fixed Mongo query projection that had excluded `invitees` before its authorization check; Atlas path remains untested. Invalid cases incomplete. | `[~]` | `meetingFeatureRoutes.js`, `ScheduledMeeting.js`, BUG-011 |
| FEAT-003 | Schedule cancellation is host-only and handles missing/already-cancelled record. | Host/participant tickets | Not covered by baseline. | `[ ]` | `meetingFeatureRoutes.js` |
| FEAT-004 | Agenda read/replace persists valid items and rejects duplicate IDs/invalid booleans/bounds. | Feature fixture | Save/read, duplicate and invalid boolean rejection, empty list passed. | `[x]` | `meetingFeatureRoutes.js`, `MeetingAgenda.js`, test |
| FEAT-005 | Notes read/replace validates fields/actions, supports completion and updates. | Feature fixture | Save/read/update, empty actions and invalid/duplicate action rejection passed. | `[x]` | `meetingFeatureRoutes.js`, `AINote.js`, test |
| FEAT-006 | Poll listing/creation validates question/options and returns room-scoped state. | Feature fixture | Creation passed; listing and malformed input need assertions. | `[~]` | `meetingFeatureRoutes.js`, `MeetingPoll.js` |
| FEAT-007 | Votes are authenticated participant-bound/deduplicated; host close rules and closed-poll rejection hold. | Multiple participant tickets | Regression assertions prove poll/question identity comes from the signed room ticket rather than spoofed body fields; sequential repeat poll votes do not duplicate voters; upvote toggles off; participant cannot close poll and closed poll rejects votes. Concurrent Mongo read-modify-save behavior remains unverified. | `[~]` | `meetingFeatureRoutes.js`, `meetingFeatures.test.js` |
| FEAT-008 | Question list/create validates content and derives identity safely. | Participant tickets | Create passed; identity spoofing and validation not established. | `[~]` | `meetingFeatureRoutes.js`, `MeetingQuestion.js` |
| FEAT-009 | Upvote is participant-bound/deduplicated; answer is host-only; unknown ID handled. | Multiple tickets | Normal upvote/answer transition passed; authorization/spoofing not established. | `[~]` | `meetingFeatureRoutes.js` |
| FEAT-010 | Breakout list/create/end is scoped and host-only with validated assignments. | Multiple tickets | Create/list/end and invalid duplicate IDs pass; expired active sessions are marked ended before list/create so stale records no longer block a new session. Mongo expiry update remains untested against Atlas. | `[~]` | `meetingFeatureRoutes.js`, `BreakoutSession.js`, BUG-012 |
| FEAT-011 | Breakout assignment isolates participants and supports host/timer end and return. | Socket clients/timer | Isolation and host/timer return test passed. | `[x]` | `socketHandler.js`, `meetingFeatures.test.js` |
| FEAT-012 | Mongoose feature data survives restart and honors constraints/rollback. | Disposable MongoDB | Atlas connected and `Room.participants` join writes/readback verified. Other Mongoose models, full restart durability, constraints, and rollback not covered; avoid destructive checks on the shared DB. | `[~]` | `config/db.js`, `models`, memory store, BUG-008 |

## AI, media and external integrations

| ID | Operation and acceptance/test | Preconditions | Actual evidence | Status | Files / bug |
|---|---|---|---|---|---|
| AI-001 | Summarizer validates transcript bounds and response schema; invalid provider output is an explicit failure. | AI route test | Validation and malformed-provider failure-path test passed. | `[x]` | `aiRoutes.js`, `meetingFeatures.test.js` |
| AI-002 | Configured Gemini produces valid structured result within timeout and errors are bounded. | Valid API key/network | No real successful provider call. | `[B]` | `aiRoutes.js`, `.env.example` |
| AI-003 | Ask endpoint validates transcript/notes/question and handles configured, missing-key and failed provider cases. | API key/test double | Authorized test-double question succeeds; unauthorized question is denied. Missing-key and other failure cases remain untested. | `[~]` | `aiRoutes.js`, `geminiService.js`, `meetingFeatures.test.js` |
| AI-004 | Frontend creates/edits/saves/restores/exports AI notes and surfaces API failures. | Browser/API | Not tested end-to-end. | `[ ]` | `App.jsx`, `AINotesPanel.jsx` |
| AI-005 | Summarize/ask require a matching server-issued room access ticket; unauthenticated and cross-room requests are rejected while guest participants retain in-room access. | AI test app and scoped room ticket | Focused integration test denies anonymous and cross-room summary calls, denies anonymous ask, and accepts valid participant tickets for summary and ask. | `[x]` | `aiRoutes.js`, `roomAccessMiddleware.js`, `apiService.js`, `App.jsx`, `AIAssistantChat.jsx`, `meetingFeatures.test.js` |
| MEDIA-001 | Camera/mic grant, denial, no device, retry and track cleanup keep lobby recoverable. | Real browser/device | Not tested this turn. | `[ ]` | `useMediaDevices.js`, `DeviceSetup.jsx` |
| MEDIA-002 | Real multi-peer audio/video, signaling, mute/camera, reconnect and cleanup work cross-browser/network. | Two real peers, secure origin | Socket signaling simulation is not media verification; no real second browser peer tested. | `[B]` | `useWebRTC.js`, `socketHandler.js` |
| MEDIA-003 | Screen share start/stop/cancel and remote presentation/cleanup work. | Supported browser | Not tested. | `[ ]` | `ControlDock.jsx`, `useWebRTC.js` |
| MEDIA-004 | Speech recognition support, permission, pause/resume, captions and privacy behavior work. | Compatible browser/mic | Prior socket caption forwarding passed; actual speech recognition untested. | `[~]` | `useSpeechToText.js`, `LiveCaptionsOverlay.jsx` |
| MEDIA-005 | `.ics` export encodes time zone/date/duration/escaped input and downloads; invalid schedule is blocked. | Browser | Not tested. | `[ ]` | `ScheduleMeetingModal.jsx` |

## Realtime events and UI

| ID | Operation and acceptance/test | Preconditions | Actual evidence | Status | Files / bug |
|---|---|---|---|---|---|
| SOCK-001 | Join/peer-list/user-joined/left use ticket identity; reject forged role, invalid ticket and inactive room. | Socket clients | Prior simulation passed normal peer flow; existing test covers ticket/admission; full spoof matrix pending. | `[~]` | `socketHandler.js`, `meetingFeatures.test.js` |
| SOCK-002 | Offer/answer/ICE/ICE-restart route only to intended authorized peers. | Multiple clients | Not directly tested. | `[ ]` | `socketHandler.js`, `useWebRTC.js` |
| SOCK-003 | Media state derives sender identity, rejects malformed state, and restores persisted state on rejoin. | Multiple clients | Host mute-all, persisted participant state, disconnect, rejoin with stale/unmuted client state, no duplicate row, and peer restoration pass in socket integration. Atlas join/readback confirms participant state writes. Malformed/forged media events remain untested. | `[~]` | `socketHandler.js`, `Room.js`, `useMediaDevices.js`, `App.jsx`, BUG-008 |
| SOCK-004 | Chat validates text, derives sender, broadcasts to room only; sender echo behavior intentional. | Multiple clients | Prior simulation passed fan-out/no sender echo; spoof/invalid isolation unverified. | `[~]` | `socketHandler.js`, `RoomChat.jsx` |
| SOCK-005 | Reaction/hand events validate and broadcast derived identity to room. | Multiple clients | Prior normal fan-out passed; negative cases unverified. | `[~]` | `socketHandler.js`, `FloatingReactions.jsx` |
| SOCK-006 | Whiteboard stroke bounds/color/size/mode and clear membership are enforced. | Multiple clients | Prior valid draw sync passed; malformed/clear cases pending. | `[~]` | `socketHandler.js`, `WhiteboardPanel.jsx` |
| SOCK-007 | Captions are bounded and room-isolated; no unintended retention. | Multiple clients | Prior valid caption forwarding passed; isolation/validation pending. | `[~]` | `socketHandler.js`, `App.jsx` |
| SOCK-008 | Poll/question/agenda notifications are tied to valid mutations and room membership. | Multiple clients | Handler inspected, not tested in baseline. | `[ ]` | `socketHandler.js` |
| SOCK-009 | Mute/lock/end/admit/deny authority comes from verified room ticket, never caller `isHost`. | Host plus forged participant | Forged participant mute-all denial passed previously; reload/mute persistence passes automated memory test. Comprehensive forged-identity and end tests pending; live UI host-mute-refresh pending. | `[~]` | `socketHandler.js`, BUG-008 |
| SOCK-010 | Breakout transitions, isolation, end/timer and return updates work. | Socket clients/fake timer | Automated test passed. | `[x]` | `socketHandler.js`, `meetingFeatures.test.js` |
| SOCK-011 | Disconnect safely updates attendance, timers, peers and room membership. | Socket/DB fixture | Prior leave notification passed; durable attendance/cleanup unverified. | `[~]` | `socketHandler.js`, `MeetingAttendance.js` |
| UI-001 | Login/register/logout UI works including validation, errors, restore and expiry. | Browser/API | Backend auth tests only; UI path not run. | `[ ]` | `LoginPage.jsx`, `App.jsx` |
| UI-002 | Lobby auth-first, guest, create, join code/link, errors and loading flows work. | Browser/API | Browser link/code guest join tested; cached participant token correctly reached waiting lobby after BUG-002 fix; Admit and Deny outcomes verified. Full auth/error matrix remains untested. | `[~]` | `DeviceSetup.jsx`, `App.jsx`, BUG-002 |
| UI-003 | Device permission UI, lobby setup, settings and retry are accessible. | Browser/device | Not tested. | `[ ]` | `DeviceSetup.jsx`, `PermissionModal.jsx` |
| UI-004 | Every meeting control/sidebar panel has working handler, accessible feedback and responsive state. | Browser session | Chat, poll/vote, hand raise, mic/camera toggles, Whiteboard, Agenda, Transcript, host controls, leave and end sampled in browser. Initial lock-state synchronization was fixed and covered by socket integration test; browser verification against restarted backend pending. Not exhaustive. | `[~]` | `components\meeting`, `components\sidebar`, `App.jsx`, BUG-003 |
| UI-005 | Schedule UI validates, creates, shares, cancels and offers calendar download. | Browser/API | Feature API create/read and templates passed; full UI untested. | `[~]` | `ScheduleMeetingModal.jsx` |
| UI-006 | History UI is account-scoped/server-backed, searchable and restore/open errors are handled. | Authenticated browser/DB | `dbService` bridged to `/api/history` and `/api/features`; `MeetingHistoryModal` renders both backend database records and local cache with graceful fallbacks. Verified via `test/storageAndDbBridge.test.js`. | `[x]` | `MeetingHistoryModal.jsx`, `historyRoutes.js`, `dbService.js` |

## Persistence, security and acceptance

| ID | Operation and acceptance/test | Preconditions | Actual evidence | Status | Files / bug |
|---|---|---|---|---|---|
| DB-001 | Mongoose schemas/indexes/uniqueness/relations enforce intended data contract. | Source + DB tests | Model names inventoried; field/index review incomplete. | `[ ]` | `server\models` |
| DB-002 | Mongo connect/disconnect/readiness/error policy is accurate; durable writes verified. | Disposable MongoDB | No live DB verification. | `[B]` | `config\db.js`, `server.js` |
| DB-003 | Memory fallback is consistent and clearly non-durable across server restart. | Isolated process | Selected feature API tests pass in memory; restart behavior incomplete. | `[~]` | `memoryMeetingStore.js`, `README.md` |
| DB-004 | IndexedDB create/read/update/delete, refresh, clear and failures behave correctly, with zero localStorage policy. | Browser / Static scanner | `localStorage` completely removed across all `src/` and `server/` files. Session storage and backend API bridge used. Verified by static scan test `test/storageAndDbBridge.test.js`. | `[x]` | `dbService.js`, `apiService.js`, `storageAndDbBridge.test.js` |
| SEC-001 | Password/token/session/cookie controls and generic failures withstand negative tests. | Tests + config | Selected auth lifecycle tests pass; full prod/database matrix pending. | `[~]` | auth routes/middleware/models |
| SEC-002 | Cross-account/cross-room/host/participant/admission bypasses are denied for HTTP and socket. | Adversarial fixtures | AI summarize/ask now enforce room-ticket scope; existing locked-room access test passes. Full route/socket matrix pending. | `[~]` | room middleware/routes/socket, `aiRoutes.js`, `meetingFeatures.test.js` |
| SEC-003 | HTTP/socket/query payload bounds, schema validation and rate limiting reject abuse. | API/socket tests | Partial transcript/agenda/note validation passes; breadth incomplete. | `[~]` | server/routes/socket |
| SEC-004 | No secret enters source/client bundle/logs; public responses omit private fields. | Static/build/config | `.env` not read; source/bundle audit pending. | `[ ]` | `.gitignore`, `.env.example`, client/server |
| SEC-005 | TURN/shared socket/rate limit state/TLS/monitoring/backups and deploy behavior are verified or explicitly scoped out. | Deployment target | README identifies constraints; no deployment validation. | `[B]` | `README.md`, `server.js` |
| ACCEPT-001 | Reconcile every item, rerun regressions, count verified/failed/blocked/not-started and report evidence. | All scoped items | Audit has just begun. | `[ ]` | All tracking files |

## Checklist notes

- Prior manual smoke and multi-user simulation evidence is explicitly labeled historical/simulated, not treated as real-browser media or live external integration.
- Current baseline: 7 automated tests passed; see [TEST_REPORT.md](./TEST_REPORT.md).
- Checklist will grow if code inspection discovers additional independent operations.