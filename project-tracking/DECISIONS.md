# Decisions

## DEC-001 — Evidence-based tracking separate from historical project docs

- **Problem:** Existing design/task documents contain conflicting completion/readiness claims.
- **Options:** Copy old checkmarks; rewrite all existing docs before validating; create a new evidence-based audit ledger and reconcile old docs later.
- **Choice:** Maintain this `project-tracking` ledger and defer edits to historical docs until the facts are checked.
- **Reason/trade-off:** Avoid claiming production readiness from scaffolding; initial checklist remains more incomplete than historic task lists.

## DEC-002 — Do not equate memory tests with MongoDB verification

- **Problem:** Tests exercise in-memory stores while MongoDB is optional and live Atlas state is unknown.
- **Choice:** Report memory-backed behavior as tested only; mark live persistence blocked pending disposable DB credentials.
- **Reason/trade-off:** Accurate persistence claim; some acceptance checks await infrastructure. A disposable local/test DB may be considered if available; never use production data for destructive tests.

## DEC-003 — No Git recovery point

- **Problem:** Project root has no `.git` metadata.
- **Choice:** Do not run history-dependent commands or claim a clean diff; make small, explicit changes only.
- **Reason/trade-off:** No commit/stash recovery is available until a real repository is supplied; do not initialize one without authorization.

## DEC-004 — Persist participant media state in the existing room record

- **Problem:** Socket presence and mute/video values existed only in process memory, while the existing `Room.participants` array stayed empty. A reload created a new socket and reset peers' media flags.
- **Options:** Add another participant-state collection; add a separate media-preferences service; use the existing participant subdocuments already defined on `Room`.
- **Choice:** Use an atomic MongoDB update pipeline to replace one subdocument per stable signed room-ticket participant ID. Keep `socketId` transient, retain media flags across disconnect, and restore them when the same ticket rejoins. The in-memory fallback follows the same stable-ID replacement behavior.
- **Reason/trade-off:** Reuses the existing data model and avoids an extra collection/index/migration. Mongoose requires `updatePipeline: true`; this was confirmed by a real Atlas join attempt and added before successful live readback. The browser applies the restored flags to local media tracks.
- **Verification boundary:** Atlas participant writes/readback and memory socket mute/rejoin behavior are verified. A real browser host-mute-refresh test was unavailable because browser pages were not shared.

## DEC-005 — Return an allowlisted room view

- **Problem:** A room-ticket holder received internal room participant, admission, account, and socket identifiers from the full room document.
- **Choice:** Project an explicit allowlist of public room metadata, settings, agenda, lock/activity status, and creation time in the room read endpoint.
- **Reason/trade-off:** No frontend caller depended on the internal fields; minimize cross-participant data exposure and keep database and in-memory responses consistent.

## DEC-006 — Room IDs identify one meeting instance

- **Problem:** Reusing a same-owner ID reactivated an ended room without invalidating its still-valid room tickets or clearing persisted participant state; database and memory paths behaved differently.
- **Choice:** Room creation is create-only. Reject malformed IDs and any existing room ID with 409; generated IDs use UUIDs, and Mongo duplicate-key races map to the same conflict.
- **Reason/trade-off:** A repeated create request must not revive a prior meeting instance or its access credentials. Callers must start a new meeting with a new ID rather than relying on same-ID create retries.
- **Verification boundary:** In-memory HTTP integration verifies new creation and duplicate handling. Concurrent uniqueness behavior relies on Mongo's unique index and was not exercised against Atlas.

## DEC-007 — Scope ended-room access to archive operations

- **Problem:** Ended rooms must reject stale feature mutations, but hosts still need to save an archive after the end event and participants need to read that archive.
- **Choice:** Regular room APIs continue to reject inactive rooms. History reads accept a valid room ticket for the ended room; archive writes pass the same ticket check but remain host-only through `requireRoomHost`.
- **Reason/trade-off:** This handles the event/request race at host end without keeping all room APIs open after meeting termination.
- **Verification boundary:** In-memory HTTP tests cover post-end archive save/read and rejection of participant writes, cross-room tickets, and stale feature calls. Mongo-backed access projection and archive behavior remain untested.

## DEC-008 — Authorize account archive reads by meeting membership

- **Problem:** Account history needs persisted transcripts and notes even when the user is no longer in the meeting or is on another device; room tickets alone are not an account-level archive credential.
- **Choice:** Keep room-ticket archive access for guests, and add a separately protected account endpoint that checks host ownership, attendee IDs, or a persisted attendance record before returning archive details.
- **Reason/trade-off:** Account archive access remains usable across devices without weakening the room-scoped ticket route or exposing room internals.
- **Verification boundary:** In-memory integration verifies host/attendee access, anonymous 401, unrelated-account 404, and a safe response shape. Mongo and real browser flows remain unverified.

## DEC-009 — Complete eradication of localStorage in favor of sessionStorage & backend MongoDB synchronization

- **Problem:** Storing auth tokens, room tickets, active meeting state, and usernames in browser `localStorage` caused token leakage across browser sessions, stale ticket races, and drift from the server's authoritative database state.
- **Choice:** Remove all `localStorage` usage across `src/` and `server/`. Use `sessionStorage` strictly for temporary, tab-scoped session memory (JWT access tokens, room admission tickets, and in-flight meeting state). Rely on MongoDB Atlas (via `/api/auth/me`, `/api/history`, `/api/features`) as the primary source of truth, backed by a static regression assertion test in `test/storageAndDbBridge.test.js`.
- **Reason/trade-off:** Protects user sessions from persisting unexpectedly across sessions, aligns with security best practices, and ensures all meeting records and profile information roundtrip through the backend database.
- **Verification boundary:** Automated static audit in `test/storageAndDbBridge.test.js` enforces zero `localStorage` across `src/`. Full test suite 16/16 and build checks pass.

## DEC-010: Authenticated Profile Persistence via `PUT /api/auth/profile`
- **Context:** The frontend `UserProfileModal` allowed users to customize display name, title/role, and avatar color gradient, but changes were only written to client-side session memory.
- **Choice:** Add `title` and `avatarColor` to the MongoDB `User` model, create `PUT /api/auth/profile` with `protect` middleware and validation, and wire `cryptoAuthService.updateProfile` to call `apiService.updateProfile`.
- **Reason/trade-off:** Allows persistent cross-device profile changes for authenticated accounts, ensures consistency between client and server, and prevents profile data loss when switching tabs or re-authenticating.
- **Verification boundary:** Automated integration tests in `test/storageAndDbBridge.test.js` verify authenticated updates, invalid payload rejections, unauthenticated 401s, and verification through `GET /api/auth/me`.

## DEC-011: Bounded In-Room Chat Message Buffering with Replay on Join
- **Context:** Chat messages sent through Socket.IO were purely broadcast-and-forget. Any participant refreshing the page or joining a meeting after messages were sent saw an empty chat history.
- **Choice:** Maintain a bounded buffer (`roomChatHistory`, max 100 messages per room) in `server/socket/socketHandler.js`, emit `room-chat-history` upon `join-room`, and clear the buffer when the host ends the meeting (`host-end-meeting`).
- **Reason/trade-off:** Prevents memory leaks by strictly bounding the buffer size to 100 messages and clearing on meeting termination, while providing a seamless Google Meet-like chat catch-up experience for participants.
- **Verification boundary:** Automated test in `test/storageAndDbBridge.test.js` asserts that a newly joined socket receives `room-chat-history` with previous messages sent in that room.


