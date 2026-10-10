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
- **Verification boundary:** In-memory integration verifies host/attendee access, anonymous 401, unrelated-account 404, and a safe response shape. Mongo and real browser archive flows remain unverified.

## DEC-009 — Keep authentication and meeting-session data out of localStorage

- **Problem:** Storing auth tokens, room tickets, active meeting state, and usernames in browser `localStorage` caused token leakage across browser sessions, stale ticket races, and drift from the server's authoritative database state.
- **Choice:** Keep JWT access tokens, room admission tickets, active meeting state, and in-flight user session data in `sessionStorage`; permit `localStorage` only for the explicit theme preference in `ThemeContext.jsx`. Use backend APIs as the primary source for account and meeting records, retaining IndexedDB as the client cache.
- **Reason/trade-off:** Session credentials should not persist across browser sessions. A deliberate display preference is non-sensitive and benefits from persisting across sessions.
- **Verification boundary:** `test/storageAndDbBridge.test.js` enforces the theme-only exception. Browser testing verified theme choice persistence; backend record durability must be judged from the individual API/DB tests, not inferred from this storage rule.

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

## DEC-012 — Separate React listener cleanup from intentional room leave

- **Problem:** A meeting effect cleanup may run during a dependency-driven effect rerun. Treating every cleanup as a permanent leave deletes the server membership needed for an admitted guest to rejoin a locked room after refresh.
- **Choice:** Effect cleanup only unsubscribes listeners; explicit meeting completion emits the permanent leave. Keep socket join de-duplication tied to the current membership identity.
- **Reason/trade-off:** Distinguishes transient UI lifecycle/reconnection from the user's explicit leave while retaining the existing room ticket and server admission rules.
- **Verification boundary:** Regression check, browser locked-room refresh with live peer media, host denial after explicit leave, and stale-ticket 403 all passed locally. The exact path was not separately proven against Atlas or cross-network TURN.

## DEC-013 — Keep expected schedule lookup misses non-noisy without changing 404 semantics

- **Problem:** Room-code entry optionally looks up schedule metadata. An unscheduled room correctly yields 404, but the shared client logger reports that expected miss as an API warning.
- **Choice:** Suppress the API-service warning only for HTTP 404 from `getScheduledMeeting`; continue to reject the lookup and preserve all other logging and error behavior. The later room join still decides whether the room exists and reports failures to the user.
- **Reason/trade-off:** Avoids treating an optional metadata miss as an operational warning without weakening the endpoint's not-found semantics or masking genuine room-join errors.
- **Verification boundary:** Browser test with intercepted 404s confirmed no schedule API warning and a visible join failure. The local API process was unavailable, so live endpoint confirmation remains pending.

## DEC-014 — Persist temporary participant disconnection separately from leave

- **Problem:** A participant row retained after a transient socket loss had `socketId: null`, but the disconnect flag was omitted from persistence and the room-state API reported the participant as connected.
- **Choice:** Persist `isDisconnected` on participant subdocuments and in the memory store. Treat a missing socket ID as disconnected when serializing older rows that predate the flag.
- **Reason/trade-off:** Makes temporary disconnect observable without conflating it with intentional leave, which removes the participant row and stamps attendance `leftAt`.
- **Verification boundary:** In-memory regression and isolated live-Mongo join/disconnect/state/rejoin/leave test passed. The shared API process was not restarted because a separate existing browser page still had an active meeting.

## DEC-015 — Use atomic Mongo updates for concurrent poll votes and question upvotes

- **Problem:** Concurrent poll vote requests loaded the same Mongoose document and raced on `save()`, causing version conflicts and lost requests. Question upvotes shared the read-modify-save race.
- **Choice:** Use conditional Mongo aggregation-pipeline updates that atomically replace a participant's poll selection or toggle their question upvote; retain the existing in-memory implementation.
- **Reason/trade-off:** Mongo applies each update against current persisted state, so simultaneous participants do not overwrite one another. Poll voting is conditioned on `status: 'open'` to avoid accepting a vote after closure.
- **Verification boundary:** A disposable Mongo route harness verified 24 concurrent poll votes, 24 concurrent question upvotes, and duplicate-free concurrent same-user toggling. No production meeting records were touched.

## DEC-016 — Keep unimplemented social providers unavailable in all environments

- **Problem:** Development GitHub/Microsoft handlers trusted profile fields supplied by the caller and created authenticated sessions without contacting either provider.
- **Choice:** Return an explicit 501 from both endpoints until a verified provider authorization-code flow is implemented. Keep the unrelated OTP development behavior unchanged.
- **Reason/trade-off:** A clear unsupported response is safer than demo-success that can be mistaken for real authentication.
- **Verification boundary:** An isolated development-mode repro returned 200 before the change; auth regression tests now confirm both endpoints return 501 without issuing cookies or sessions.

## DEC-017 — Detect Google popup closure before the long OAuth timeout

- **Problem:** If a Google popup closed without delivering its result, the login page remained busy until the three-minute timeout.
- **Choice:** Observe closure every 500 ms and report failure after a 1.5-second grace period, allowing a just-posted callback message to reach the opener.
- **Reason/trade-off:** Provides prompt recovery for blocked/misconfigured callbacks while retaining strict postMessage origin/source checks and the existing long allowance for the user to complete Google sign-in.
- **Verification boundary:** Chromium E2E verified the no-response closure path; a real external Google transaction remains unverified.

## DEC-018 — Keep development CORS permissive only when no allowlist is configured

- **Observation:** With `NODE_ENV=development` and no `CORS_ORIGINS`, the local API reflects arbitrary request origins and allows credentials. In production, the same app emits CORS headers only for an exact configured allowlist match.
- **Choice:** Preserve the development convenience behavior; require deployment to set `CORS_ORIGINS` and run with `NODE_ENV=production`. Treat development-mode exposure beyond a trusted local environment as unsupported.
- **Verification boundary:** Live development API behavior and an isolated production-config allow/deny check confirmed the branches; production deployment configuration itself was not inspected.

## DEC-019 — Enforce one active breakout session per room in MongoDB

- **Problem:** The route's active-session lookup followed by insert allowed concurrent create requests to persist multiple active breakouts for the same room.
- **Choice:** Add a partial unique Mongo index on `{ roomId, status }` where status is `active`, ensure it during database startup, and translate duplicate-key races to the route's 409 conflict response.
- **Existing-data policy:** Do not auto-delete or rewrite duplicate active records to make the index succeed. Fail database readiness if the constraint cannot be established, preserving the conflicting records for deliberate operator resolution.
- **Verification boundary:** A disposable MongoDB regression verified the concurrent-write invariant and that startup fails closed while leaving pre-existing duplicate rows intact. No Atlas migration or cleanup was attempted.

## DEC-020 — Default new host-created rooms to locked

- **Problem:** Both room creation routes forced new meetings open, despite existing host lock controls and admission flow.
- **Choice:** Default new room documents and both creation endpoints to `isLocked: true`; allow an explicit boolean host choice, reject other values, and initialize the host UI from the server-created room state.
- **Reason/trade-off:** Late arrivals must request admission unless the host explicitly opens the room. Existing rooms are not rewritten; hosts retain live lock/unlock controls.
- **Verification boundary:** API and socket regressions plus schema-default inspection passed using in-memory fixtures. Mongo-backed create/read persistence and browser-driven first-join behavior remain unverified.
