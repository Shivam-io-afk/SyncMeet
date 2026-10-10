# SyncMeet AI — Audit and Delivery Plan

## Purpose and scope

Audit the existing codebase rather than treating historical project checkmarks as proof. Inventory user-visible actions, API operations, Socket.IO events, persistence, external integrations, authorization and failure paths. Execute appropriate tests, fix reproduced defects surgically, record evidence, and keep unverified work visible. Production readiness is not assumed.

## Repository snapshot (2026-10-09, UTC+05:30)

- Root: `C:\WEB\React\Reat2.0`.
- Git metadata is absent at this root (`git status` reports that this is not a Git repository). Do not claim a clean diff or create recovery commits.
- Existing docs include `README.md` and `Project\*.md`; their statuses and descriptions conflict in places. This tracking directory records observed source/test state and should be reconciled with those docs only after verification.
- `.env` exists but was not read or copied. No application code changed during baseline inspection.
- The three existing tracking files were empty; they are now populated. This file plus `OPERATION_CHECKLIST.md`, `PROGRESS.md`, `BUG_LOG.md`, `TEST_REPORT.md` and `DECISIONS.md` are the audit ledger.

## Observed architecture

| Layer | Actual code observed |
|---|---|
| Frontend | React 18, Vite 6, Tailwind CSS; orchestration in `src\App.jsx`; login, lobby, dashboard/history, meeting, sidebar and common UI under `src\components`. |
| Client integration | Fetch wrapper `src\services\apiService.js`; Socket.IO client `socketService.js`; browser persistence `dbService.js`; auth and Gemini adapters. |
| Media | Browser media APIs and WebRTC mesh (`src\hooks\useWebRTC.js`), Web Speech API transcription, audio visualization. |
| Backend | Node ES modules, Express 5, Socket.IO in `server\server.js`; REST under `server\routes`; event handlers in `server\socket\socketHandler.js`. |
| Auth/access | bcrypt, signed access JWTs, rotating HttpOnly refresh cookie and sessions; optional Google OAuth flow; room-scoped tickets and room middleware. Each operation still needs a security test. |
| Persistence | Mongoose plus optional MongoDB; in-memory store fallback; browser IndexedDB. In-memory success is not evidence of Atlas durability. |
| External services | Optional Gemini API, Google OAuth config, browser-provided speech recognition. Redis-related packages (`ioredis`, BullMQ, and the Socket.IO Redis adapter) are dependencies; actual deployment configuration and service availability are not established by package presence. |
| Tests/tooling | `node:test` tests in `test\`; `npm run check` syntax-checks selected backend/test files and builds Vite; `npm run lint` runs ESLint. |

## Frontend-to-backend map

- `src\App.jsx`: account/lobby/meeting orchestration, room join/reconnect, history, notes/agenda, AI summary and socket listeners.
- `src\components\auth`: login, menu, profile.
- `src\components\lobby`: device setup, permission, waiting room, scheduling.
- `src\components\dashboard`, `src\components\history`: dashboard and meeting archives.
- `src\components\meeting`: meeting, media tiles/grid, controls, host admission, breakouts, whiteboard and reactions.
- `src\components\sidebar`: chat, transcript, agenda, AI notes/assistant, polls/questions.
- `src\hooks`: media, WebRTC, transcription and visualization.
- Complete control-to-handler and caller mapping is still an audit task, not a verified claim.

## REST/API inventory from route definitions

| API | Operations present |
|---|---|
| `/api/auth` | register, login, refresh, logout, logout-all, Google start/callback, GitHub, Microsoft, OTP send/verify, current user |
| `/api/rooms` | account room create, guest room create, join ticket, access-controlled room read |
| `/api/ai` | room-ticket-scoped summarize and ask (`/rooms/:roomId/summarize`, `/rooms/:roomId/ask`) |
| `/api/history` | authenticated recent history, host archive save, access-controlled archive read |
| `/api/features` | templates; schedules list/read/create/cancel; room notes and agenda read/replace; polls list/create/vote/close; questions list/create/upvote/answer; breakouts list/create/end |
| Health | `/health`, `/api/health` |

See checklist for per-operation IDs, success/failure expectations and current verification state.

## Data models found

Mongoose models: `User`, `AuthSession`, `Room`, `Transcript`, `AINote`, `ScheduledMeeting`, `MeetingAgenda`, `MeetingPoll`, `MeetingQuestion`, `BreakoutSession`, `MeetingAttendance`, and `HiddenMeeting`. Process-local maps are in `server\store\memoryMeetingStore.js`; client local data uses IndexedDB. Field constraints, indexes, relationships, retention and live database behavior remain under review.

## Security/reliability requirements

1. Keep secrets server-side; never print `.env` values or add secrets to `VITE_*`.
2. Enforce auth, refresh replay/revocation, room-ticket scope, host-only actions, identity and resource ownership server-side.
3. Validate and bound every HTTP/socket input; derive identities from verified credentials rather than caller-supplied roles/names.
4. Verify CORS, cookies, proxy trust, rate limits, error leakage and dependency outage behavior.
5. Test against only isolated disposable infrastructure; memory fallback does not prove durable DB behavior.
6. Verify media/transcription privacy indicators and test WebRTC separately from signaling.
7. Do not run destructive actions against production or real user data.

## Verification and phases

1. Repository/docs discovery and baseline.
2. Operation inventory and acceptance criteria.
3. Startup, environment, health and database behavior.
4. Auth/session lifecycle and account authorization.
5. Room lifecycle, admission and host controls.
6. Feature API validation, access and persistence.
7. Socket signaling/collaboration authorization.
8. Frontend user journeys.
9. AI, speech, media and external integrations.
10. Security/reliability/performance review, fixes and regressions.
11. Acceptance, documentation reconciliation and evidence-based final report.

For each item, test a normal case plus relevant invalid, unauthenticated, unauthorized, absent-resource and dependency-failure cases. Rerun regressions after changes. Browser/API/memory/provider-double tests do not stand in for real configured service integration.

## Acceptance criteria

- Each operation has an ID, behavior, preconditions, procedure, actual result, status, files and evidence.
- `[x] VERIFIED` only follows execution of a relevant test; source presence/build success alone is insufficient.
- Security-sensitive operations include negative authorization tests.
- Bugs have reproduction/root cause/fix/regression evidence.
- External or unavailable infrastructure is marked blocked/unverified with impact and next action.
- Final counts and risks reflect the checklist; no 100% claim while required work remains.

## Risks/blockers at audit start

- No Git metadata at project root.
- No live MongoDB/Atlas, Google OAuth, Gemini, email/OTP or production deployment validation yet.
- README documents no TURN relay and process-local Socket.IO/rate-limit state, limiting resilient cross-network media and multi-instance deployment.
- Baseline suite uses in-memory state for feature integration.
- Gemini test intentionally exercises invalid provider output; successful live Gemini output is unverified.
- Historical docs disagree about readiness; reconcile after source/test evidence is gathered.

## Tracking

- [Checklist](./OPERATION_CHECKLIST.md)
- [Progress](./PROGRESS.md)
- [Bug log](./BUG_LOG.md)
- [Test report](./TEST_REPORT.md)
- [Decisions](./DECISIONS.md)